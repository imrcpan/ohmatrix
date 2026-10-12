import { EventType, MsgType, NotificationCountType, RelationType, type MatrixClient, type MatrixEvent, type Room } from "matrix-js-sdk";
import type { MessageContent, ReactionSummary, RoomSummary, TimelineItem } from "@ohmatrix/core";

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
      return `${name} changed the topic`;
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

function messageContent(ev: MatrixEvent): MessageContent {
  const c = ev.getContent();
  const body = typeof c.body === "string" ? c.body : "";
  switch (c.msgtype) {
    case MsgType.Text:
    case MsgType.Notice:
      return {
        kind: "text",
        body: c["m.relates_to"]?.["m.in_reply_to"] ? stripReplyFallback(body) : body,
        ...(typeof c.formatted_body === "string" && { formattedBody: c.formatted_body }),
      };
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
function stripReplyFallback(body: string): string {
  if (!body.startsWith("> ")) return body;
  const i = body.indexOf("\n\n");
  return i === -1 ? body : body.slice(i + 2);
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

export function toTimelineItem(client: MatrixClient, ev: MatrixEvent): TimelineItem | null {
  const id = ev.getId();
  const roomId = ev.getRoomId();
  if (!id || !roomId || ev.isRedacted() || ev.isRelation("m.replace")) return null;
  const sender = ev.getSender() ?? "";
  const senderName = nameOf(ev.sender, sender);
  let content: MessageContent | null = null;
  switch (ev.getType()) {
    case EventType.RoomMessage:
      content = messageContent(ev);
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
    ...(txn && { transactionId: txn }),
    ...(reactions && { reactions }),
    ...(replyTo && { replyTo }),
    ...(ev.replacingEventId() && { edited: true }),
  };
}

export function roomItems(client: MatrixClient, room: Room): TimelineItem[] {
  const out: TimelineItem[] = [];
  for (const ev of room.getLiveTimeline().getEvents()) {
    const item = toTimelineItem(client, ev);
    if (item) out.push(item);
  }
  // Pending local echoes are not in the live timeline until sent in older SDKs; include them.
  for (const ev of room.getPendingEvents()) {
    const item = toTimelineItem(client, ev);
    if (item && !out.some((o) => (o.transactionId ?? o.id) === (item.transactionId ?? item.id))) out.push(item);
  }
  return out;
}

function isDirect(client: MatrixClient, room: Room): boolean {
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
  const pinned = !!room.tags?.["m.favourite"];
  const markedUnread = !!(room.getAccountData("m.marked_unread")?.getContent() as { unread?: boolean } | undefined)?.unread;
  return {
    id: room.roomId,
    name: room.name || room.roomId,
    ...(avatar && { avatar }),
    ...(pinned && { pinned }),
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
