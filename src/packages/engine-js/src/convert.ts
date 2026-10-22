import { EventType, MsgType, NotificationCountType, RelationType, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk";
import type { LinkPreview, MessageContent, Reader, ReactionSummary, RoomSummary, TimelineItem } from "@ohmatrix/core";

const localpart = (id: string) => id.replace(/^@/, "").replace(/:.*$/, "");
/** Member display name; matrix-js-sdk falls back to the full MXID when none is set, which we shorten. */
export const nameOf = (m: { name?: string } | null | undefined, id: string) => (m?.name && m.name !== id ? m.name : localpart(id));

function serviceText(ev: MatrixEvent, name: string): string | null {
  const c = ev.getContent();
  switch (ev.getType()) {
    case EventType.RoomCreate:
      return `${name} created the room`;
    case EventType.RoomName:
      return c.name ? `${name} changed the room name to “${c.name}”` : `${name} removed the room name`;
    case EventType.RoomTopic:
      return `${name} changed the description`;
    case EventType.RoomMember: {
      const target = (c.displayname as string | undefined) ?? localpart(ev.getStateKey() ?? "");
      const prev = ev.getPrevContent()?.membership as string | undefined;
      switch (c.membership) {
        case "join":
          return prev === "join" ? null : `${target} joined`;
        case "leave":
          return ev.getSender() === ev.getStateKey() ? `${target} left` : `${target} was removed`;
        case "invite":
          return `${name} invited ${target}`;
        default:
          return null;
      }
    }
    default:
      return null;
  }
}

/** The first `limit` distinct http(s) URLs in a body, in order. */
export function firstUrls(body: string, limit = 2): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/https?:\/\/[^\s<>()[\]]+/g)) {
    // Trim trailing punctuation that is usually sentence punctuation, not part of the URL.
    const url = m[0].replace(/[.,;:!?'"”’)\]]+$/, "");
    if (!out.includes(url)) out.push(url);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Link previews as sent by Synapse's URL previews (`com.beeper.linkpreviews`, the shape Element and
 * Beeper use) plus the newer `org.matrix.msc4095.previews`. Never fetched by us: only rendered.
 */
function previewsOf(c: Record<string, unknown>): LinkPreview[] | undefined {
  const raw = (c["com.beeper.linkpreviews"] ?? c["org.matrix.msc4095.previews"]) as unknown;
  if (!Array.isArray(raw)) return undefined;
  const out: LinkPreview[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const url = (o.matched_url ?? o["og:url"] ?? o.url) as string | undefined;
    if (!url) continue;
    const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : undefined);
    const num = (k: string) => (typeof o[k] === "number" ? (o[k] as number) : undefined);
    out.push({
      url,
      ...(str("og:title") ? { title: str("og:title")! } : {}),
      ...(str("og:description") ? { description: str("og:description")! } : {}),
      ...(str("og:image") ? { image: str("og:image")! } : {}),
      ...(num("og:image:width") ? { imageWidth: num("og:image:width")! } : {}),
      ...(num("og:image:height") ? { imageHeight: num("og:image:height")! } : {}),
      ...(str("og:site_name") ? { siteName: str("og:site_name")! } : {}),
    });
  }
  return out.length ? out : undefined;
}

function messageContent(ev: MatrixEvent, myUserId?: string): MessageContent {
  const c = ev.getContent();
  const body = typeof c.body === "string" ? c.body : "";
  switch (c.msgtype) {
    case MsgType.Text:
    case MsgType.Notice: {
      const ids = (c["m.mentions"] as { user_ids?: unknown } | undefined)?.user_ids;
      const mentions = Array.isArray(ids) ? ids.filter((u): u is string => typeof u === "string") : undefined;
      const previews = previewsOf(c);
      return {
        kind: "text",
        body: c["m.relates_to"]?.["m.in_reply_to"] ? stripReplyFallback(body) : body,
        ...(typeof c.formatted_body === "string" && { formattedBody: c.formatted_body }),
        ...(mentions?.length && { mentions }),
        ...(mentions && myUserId && mentions.includes(myUserId) && { mentionsMe: true }),
        ...(previews && { previews }),
      };
    }
    case MsgType.Emote:
      return { kind: "text", body: `* ${body}` };
    case MsgType.Image: {
      const info = c.info as { w?: number; h?: number; mimetype?: string } | undefined;
      const url = typeof c.url === "string" ? c.url : (c.file?.url as string | undefined);
      if (!url) return { kind: "unsupported", body: body || "Image" };
      return {
        kind: "image",
        url,
        body,
        ...(info?.w && { width: info.w }),
        ...(info?.h && { height: info.h }),
        ...(info?.mimetype && { mimeType: info.mimetype }),
        ...(c.file && { encryption: c.file }),
      };
    }
    case MsgType.Video: {
      const info = c.info as
        | {
            w?: number;
            h?: number;
            duration?: number;
            size?: number;
            mimetype?: string;
            thumbnail_url?: string;
            thumbnail_file?: { url?: string };
            thumbnail_info?: { mimetype?: string };
          }
        | undefined;
      const url = typeof c.url === "string" ? c.url : (c.file?.url as string | undefined);
      if (!url) return { kind: "unsupported", body: body || "Video" };
      const thumbUrl = info?.thumbnail_url ?? info?.thumbnail_file?.url;
      return {
        kind: "video",
        url,
        name: (c.filename as string | undefined) ?? (body || "video"),
        ...(info?.w && { width: info.w }),
        ...(info?.h && { height: info.h }),
        ...(info?.duration && { durationMs: info.duration }),
        ...(info?.size && { size: info.size }),
        ...(info?.mimetype && { mimeType: info.mimetype }),
        ...(c.file && { encryption: c.file }),
        ...(thumbUrl && {
          thumbnail: {
            url: thumbUrl,
            ...(info?.thumbnail_file && { encryption: info.thumbnail_file }),
            ...(info?.thumbnail_info?.mimetype && { mimeType: info.thumbnail_info.mimetype }),
          },
        }),
      };
    }
    case MsgType.Audio: {
      const info = c.info as { duration?: number; size?: number; mimetype?: string } | undefined;
      const url = typeof c.url === "string" ? c.url : (c.file?.url as string | undefined);
      if (!url) return { kind: "unsupported", body: body || "Audio" };
      // Voice messages carry MSC3245's marker; their length and waveform live in MSC1767's audio block.
      const voice = "org.matrix.msc3245.voice" in c || "m.voice" in c;
      const ext = c["org.matrix.msc1767.audio"] as { duration?: number; waveform?: number[] } | undefined;
      const duration = ext?.duration ?? info?.duration;
      const wave = Array.isArray(ext?.waveform) ? ext!.waveform.map((n) => Math.max(0, Math.min(1, n / 1024))) : undefined;
      return {
        kind: "audio",
        url,
        name: (c.filename as string | undefined) ?? (body || "audio"),
        ...(duration && { durationMs: duration }),
        ...(info?.size && { size: info.size }),
        ...(info?.mimetype && { mimeType: info.mimetype }),
        ...(c.file && { encryption: c.file }),
        ...(voice && { voice }),
        ...(wave && { waveform: wave }),
      };
    }
    case MsgType.File: {
      const info = c.info as { size?: number; mimetype?: string } | undefined;
      const url = typeof c.url === "string" ? c.url : (c.file?.url as string | undefined);
      if (!url) return { kind: "unsupported", body: body || "File" };
      return {
        kind: "file",
        url,
        name: (c.filename as string | undefined) ?? (body || "file"),
        ...(info?.size && { size: info.size }),
        ...(info?.mimetype && { mimeType: info.mimetype }),
        ...(c.file && { encryption: c.file }),
      };
    }
    default:
      return { kind: "unsupported", body: body || "Unsupported message" };
  }
}

/** Aggregated annotations on an event, most-used first. */
export function reactionsOf(client: MatrixClient, room: Room | null, eventId: string): ReactionSummary[] | undefined {
  const rel = room?.relations.getChildEventsForEvent(eventId, RelationType.Annotation, EventType.Reaction);
  const me = client.getUserId();
  const out: ReactionSummary[] = [];
  for (const [key, events] of rel?.getSortedAnnotationsByKey() ?? []) {
    const live = [...events].filter((e) => !e.isRedacted());
    if (live.length) out.push({ key, count: live.length, mine: live.some((e) => e.getSender() === me) });
  }
  return out.length ? out : undefined;
}

/** Body without the legacy "> <@user> quoted" reply fallback that older clients prepend. */
export function stripReplyFallback(body: string): string {
  if (!body.startsWith("> ")) return body;
  const i = body.indexOf("\n\n");
  // Whatever separated the quote from the reply, the reply itself never starts with blank lines.
  return i === -1 ? body : body.slice(i + 2).replace(/^\n+/, "");
}

function replyOf(client: MatrixClient, room: Room | null, ev: MatrixEvent): TimelineItem["replyTo"] | undefined {
  const id = ev.getContent()["m.relates_to"]?.["m.in_reply_to"]?.event_id as string | undefined;
  if (!id) return undefined;
  const orig = room?.findEventById(id);
  const sender = orig?.getSender() ?? "";
  const senderName = nameOf(orig?.sender, sender);
  let preview = "…";
  if (orig && !orig.isRedacted()) {
    const c = orig.getContent();
    preview = orig.isDecryptionFailure() ? "🔒" : c.msgtype === MsgType.Image ? "📷 Photo" : stripReplyFallback(String(c.body ?? ""));
  }
  return { id, sender, senderName, preview };
}

/** Where each other member has read up to, as positions in the live timeline. */
interface ReadMarkers {
  positions: Map<string, number>;
  readers: { userId: string; name: string; at: number }[];
}

function readMarkers(client: MatrixClient, room: Room): ReadMarkers {
  const positions = new Map<string, number>();
  room
    .getLiveTimeline()
    .getEvents()
    .forEach((e, i) => {
      const id = e.getId();
      if (id) positions.set(id, i);
    });
  const me = client.getUserId();
  const readers = room
    .getJoinedMembers()
    .filter((m) => m.userId !== me)
    .flatMap((m) => {
      const id = room.getEventReadUpTo(m.userId);
      const at = id ? positions.get(id) : undefined;
      return at === undefined ? [] : [{ userId: m.userId, name: nameOf(m, m.userId), at }];
    });
  return { positions, readers };
}

/** Everyone whose read marker is at or after `ev` (a receipt covers all earlier messages too). */
function readersOf(ev: MatrixEvent, markers: ReadMarkers): Reader[] | undefined {
  const at = ev.getId() ? markers.positions.get(ev.getId()!) : undefined;
  if (ev.status || at === undefined) return undefined; // still sending, or not in the live timeline
  const out = markers.readers.filter((r) => r.at >= at).map(({ userId, name }) => ({ userId, name }));
  return out.length ? out : undefined;
}

/** Plain-text preview of a decrypted message for notifications; undefined when there is nothing readable. */
export function notificationPreview(ev: MatrixEvent): string | undefined {
  if (ev.isDecryptionFailure() || ev.getType() === EventType.RoomMessageEncrypted) return undefined;
  const c = ev.getContent();
  switch (c.msgtype) {
    case MsgType.Image:
      return "📷";
    case MsgType.Video:
      return `🎬 ${(c.filename as string | undefined) ?? c.body ?? ""}`.trim();
    case MsgType.Audio:
      return "org.matrix.msc3245.voice" in c || "m.voice" in c ? "🎤" : `🎵 ${(c.filename as string | undefined) ?? c.body ?? ""}`.trim();
    case MsgType.File:
      return `📎 ${(c.filename as string | undefined) ?? c.body ?? ""}`.trim();
    default: {
      const t = typeof c.body === "string" ? stripReplyFallback(c.body).replace(/\s+/g, " ").trim() : "";
      return t || undefined;
    }
  }
}

/** Display names of people typing in `room`, excluding me. */
export function typingNames(client: MatrixClient, room: Room): string[] {
  const me = client.getUserId();
  return room.currentState
    .getMembers()
    .filter((m) => m.typing && m.userId !== me)
    .map((m) => nameOf(m, m.userId));
}

export function toTimelineItem(client: MatrixClient, ev: MatrixEvent, markers?: ReadMarkers): TimelineItem | null {
  const id = ev.getId();
  const roomId = ev.getRoomId();
  if (!id || !roomId || ev.isRedacted() || ev.isRelation("m.replace")) return null;
  const sender = ev.getSender() ?? "";
  const senderName = nameOf(ev.sender, sender);
  let content: MessageContent | null = null;
  switch (ev.getType()) {
    case EventType.RoomMessage:
      content = messageContent(ev, client.getUserId() ?? undefined);
      break;
    case EventType.RoomMessageEncrypted:
      content = { kind: "undecryptable" };
      break;
    case EventType.Sticker:
      content = { kind: "unsupported", body: "Sticker" };
      break;
    default: {
      const text = serviceText(ev, senderName);
      if (text) content = { kind: "service", body: text };
    }
  }
  if (!content) return null;
  const s = ev.status;
  const status = s === null || s === undefined ? "sent" : s === "not_sent" ? "failed" : s === "sent" ? "sent" : "sending";
  const txn = ev.getTxnId();
  const room = client.getRoom(roomId);
  const reactions = reactionsOf(client, room, id);
  const readBy = markers && sender === client.getUserId() ? readersOf(ev, markers) : undefined;
  const replyTo = ev.getType() === EventType.RoomMessage ? replyOf(client, room, ev) : undefined;
  const avatar = ev.sender?.getMxcAvatarUrl();
  return {
    id,
    roomId,
    sender,
    senderName,
    ...(avatar && { senderAvatar: avatar }),
    isOwn: sender === client.getUserId(),
    ts: ev.getTs(),
    content,
    status,
    ...(isPinned(room, id) && { pinned: true }),
    ...(txn && { transactionId: txn }),
    ...(reactions && { reactions }),
    ...(readBy && { readBy }),
    ...(replyTo && { replyTo }),
    ...(ev.replacingEventId() && { edited: true }),
  };
}

export function roomItems(client: MatrixClient, room: Room): TimelineItem[] {
  const out: TimelineItem[] = [];
  const markers = readMarkers(client, room);
  for (const ev of room.getLiveTimeline().getEvents()) {
    const item = toTimelineItem(client, ev, markers);
    if (item) out.push(item);
  }
  // Pending local echoes are not in the live timeline until sent in older SDKs; include them.
  for (const ev of room.getPendingEvents()) {
    const item = toTimelineItem(client, ev);
    if (item && !out.some((o) => (o.transactionId ?? o.id) === (item.transactionId ?? item.id))) out.push(item);
  }
  return out;
}

/** Event ids pinned in `room` (m.room.pinned_events). */
export function pinnedIds(room: Room | null): string[] {
  const c = room?.currentState.getStateEvents(EventType.RoomPinnedEvents, "")?.getContent() as { pinned?: unknown; events?: unknown } | undefined;
  // `pinned` is what the spec and the other clients write; `events` is what this app wrote before, still read so that old pins show.
  const list = Array.isArray(c?.pinned) ? c!.pinned : c?.events;
  return Array.isArray(list) ? list.filter((e): e is string => typeof e === "string") : [];
}

const isPinned = (room: Room | null, eventId: string) => pinnedIds(room).includes(eventId);

export function isDirect(client: MatrixClient, room: Room): boolean {
  const direct = client.getAccountData("m.direct" as never)?.getContent<Record<string, string[]>>() ?? {};
  if (Object.values(direct).some((ids) => ids.includes(room.roomId))) return true;
  const named = room.currentState.getStateEvents(EventType.RoomName, "");
  return !named && room.getJoinedMemberCount() <= 2 && room.getInvitedAndJoinedMemberCount() <= 2;
}

export function toRoomSummary(client: MatrixClient, room: Room): RoomSummary {
  if (room.getMyMembership() === "invite") return toInviteSummary(client, room);
  const items = roomItems(client, room);
  const direct = isDirect(client, room);
  const last = items[items.length - 1];
  const lastMessage = [...items].reverse().find((i) => i.content.kind !== "service") ?? last;
  const avatar = room.getMxcAvatarUrl() ?? (direct ? room.getAvatarFallbackMember()?.getMxcAvatarUrl() : undefined);
  const rule = client.getRoomPushRule("global", room.roomId);
  const muted = !!rule && rule.enabled !== false && !rule.actions?.some((a) => a === "notify");
  const pinned = !!room.tags?.["m.favourite"];
  const markedUnread = !!(room.getAccountData("m.marked_unread")?.getContent() as { unread?: boolean } | undefined)?.unread;
  return {
    id: room.roomId,
    name: room.name || room.roomId,
    ...(avatar && { avatar }),
    isSpace: room.getType() === "m.space",
    ...(muted && { muted }),
    ...(pinned && { pinned }),
    ...(typingNames(client, room).length ? { typing: typingNames(client, room) } : {}),
    ...(markedUnread && { markedUnread }),
    isDirect: direct,
    memberCount: room.getJoinedMemberCount(),
    unreadCount: room.getUnreadNotificationCount(NotificationCountType.Total) ?? 0,
    highlightCount: room.getUnreadNotificationCount(NotificationCountType.Highlight) ?? 0,
    ...(lastMessage ? { lastMessage } : {}),
    lastActivityTs: last?.ts ?? 0,
  };
}

function toInviteSummary(client: MatrixClient, room: Room): RoomSummary {
  const me = room.getMember(client.getUserId() ?? "");
  const inviterId = me?.events.member?.getSender() ?? "";
  const inviter = nameOf(room.getMember(inviterId), inviterId);
  const avatar = room.getMxcAvatarUrl();
  return {
    id: room.roomId,
    name: room.name || room.roomId,
    ...(avatar && { avatar }),
    invite: { inviter },
    isDirect: !!me?.events.member?.getContent().is_direct,
    memberCount: 0,
    unreadCount: 0,
    highlightCount: 0,
    lastActivityTs: me?.events.member?.getTs() ?? Date.now(),
  };
}
