import type { EventItemLike, ItemContent, ReplyLike } from "./timelineItem.js";
import type { MembershipChange, StateChange } from "./serviceText.js";

/**
 * Reads the SDK's `EventTimelineItem` (as the bindings hand it over: tagged unions in `{ tag, inner }`, `bigint`
 * timestamps, a map of receipts) into the plain `EventItemLike` the converters work from. Written against structural
 * shapes, not the generated types, so it can be tested with plain objects; `sdkBindings.ts` is what is checked against
 * the real types.
 */

interface Tagged {
  tag: string;
  inner?: Record<string, unknown> | undefined;
}

/** The SDK's `EventTimelineItem`, as far as we read it. */
export interface RawEvent {
  eventOrTransactionId: Tagged;
  sender: string;
  senderProfile: Tagged;
  isOwn: boolean;
  content: Tagged;
  timestamp: bigint | number;
  localSendState?: Tagged | undefined;
  readReceipts?: Map<string, unknown> | undefined;
}

/** The SDK's room membership change enum: numbers in the order of its declaration. */
export const MEMBERSHIP_CHANGES: MembershipChange[] = [
  "None",
  "Error",
  "Joined",
  "Left",
  "Banned",
  "Unbanned",
  "Kicked",
  "Invited",
  "KickedAndBanned",
  "InvitationAccepted",
  "InvitationRejected",
  "InvitationRevoked",
  "Knocked",
  "KnockAccepted",
  "KnockRetracted",
  "KnockDenied",
  "NotImplemented",
];

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

/** The profile fields of a `ProfileDetails`, when it is `Ready`. */
function profileOf(p: Tagged | undefined): { name?: string | undefined; avatar?: string | undefined } {
  if (p?.tag !== "Ready") return {};
  return { name: str(p.inner?.["displayName"]), avatar: str(p.inner?.["avatarUrl"]) };
}

interface MediaSource {
  url(): string;
  toJson(): string;
}
type Info =
  | { width?: bigint | number; height?: bigint | number; mimetype?: string; size?: bigint | number; duration?: number; thumbnailSource?: MediaSource }
  | undefined;

const dims = (info: Info): { width?: number; height?: number } => {
  const width = num(info?.width);
  const height = num(info?.height);
  return { ...(width !== undefined && { width }), ...(height !== undefined && { height }) };
};
const num = (v: unknown): number | undefined => (typeof v === "bigint" || typeof v === "number" ? Number(v) : undefined);

/**
 * What the SDK needs to open a file again, kept as the JSON of its source; only a source that carries keys (the room is
 * encrypted) needs it, since a plain `mxc://` address says all the rest.
 */
function encryptionOf(source: MediaSource | undefined): string | undefined {
  if (!source) return undefined;
  const json = source.toJson();
  return json.includes('"key"') ? json : undefined;
}

/** A line saying what a message is, for a reply's quote and a chat row. */
export function messageBody(msgType: Tagged): { body: string; formatted?: string | undefined } | null {
  const c = msgType.inner?.["content"] as Record<string, unknown> | undefined;
  switch (msgType.tag) {
    case "Text":
    case "Notice":
    case "Emote": {
      const f = c?.["formatted"] as { body?: string } | undefined;
      return { body: str(c?.["body"]) ?? "", formatted: f?.body };
    }
    case "Image":
    case "Video":
    case "Audio":
    case "File":
      return { body: str(c?.["caption"]) ?? str(c?.["filename"]) ?? "" };
    default:
      return null;
  }
}

/** A media message as our content; `null` for a kind that is not media. */
function mediaContent(msgType: Tagged): ItemContent | null {
  const c = msgType.inner?.["content"] as
    { filename?: string; caption?: string; source?: MediaSource; info?: Info; voice?: unknown; audio?: { duration?: number; waveform?: number[] } } | undefined;
  if (!c?.source) return null;
  const url = c.source.url();
  const info = c.info;
  const encryption = encryptionOf(c.source);
  const common = {
    url,
    ...(info?.mimetype && { mimeType: info.mimetype }),
    ...(encryption && { encryption }),
  };
  const size = num(info?.size);
  const name = c.filename ?? c.caption ?? "";
  switch (msgType.tag) {
    case "Image":
      return {
        type: "image",
        body: c.caption ?? name,
        ...common,
        ...dims(info),
      };
    case "Video": {
      const thumb = info?.thumbnailSource;
      const thumbEnc = encryptionOf(thumb);
      return {
        type: "video",
        name,
        ...common,
        ...(size !== undefined && { size }),
        ...dims(info),
        ...(info?.duration !== undefined && { durationMs: Math.round(Number(info.duration)) }),
        ...(thumb && { thumbnail: { url: thumb.url(), ...(thumbEnc && { encryption: thumbEnc }) } }),
      };
    }
    case "Audio": {
      const ms = c.audio?.duration ?? info?.duration;
      return {
        type: "audio",
        name,
        ...common,
        ...(size !== undefined && { size }),
        ...(ms !== undefined && { durationMs: Math.round(Number(ms)) }),
        ...(c.voice ? { voice: true } : {}),
        ...(c.audio?.waveform?.length ? { waveform: c.audio.waveform.map((n) => Math.max(0, Math.min(1, n / 1024))) } : {}),
      };
    }
    case "File":
      return { type: "file", name, ...common, ...(size !== undefined && { size }) };
    default:
      return null;
  }
}

/** The message a reply answers, as far as the SDK has it. */
function replyOf(r: { eventId(): string; event(): Tagged } | undefined): ReplyLike | undefined {
  if (!r) return undefined;
  const eventId = r.eventId();
  const d = r.event();
  if (d.tag !== "Ready") return { eventId };
  const i = d.inner ?? {};
  const content = i["content"] as Tagged | undefined;
  const kind = (content?.inner?.["content"] as { kind?: Tagged } | undefined)?.kind;
  const msgType = (kind?.inner?.["content"] as { msgType?: Tagged } | undefined)?.msgType;
  const profile = profileOf(i["senderProfile"] as Tagged | undefined);
  return { eventId, original: { sender: str(i["sender"]) ?? "", senderName: profile.name, body: (msgType && messageBody(msgType)?.body) || "" } };
}

function itemContent(raw: Tagged): ItemContent {
  switch (raw.tag) {
    case "MsgLike": {
      const msgLike = raw.inner?.["content"] as
        { kind: Tagged; reactions?: { key: string; senders: { senderId: string }[] }[]; inReplyTo?: { eventId(): string; event(): Tagged } } | undefined;
      const kind = msgLike?.kind;
      if (kind?.tag === "Message") {
        const message = kind.inner?.["content"] as { msgType: Tagged; isEdited?: boolean } | undefined;
        if (!message) return { type: "unsupported", description: "Message" };
        const extras = {
          ...(message.isEdited && { edited: true }),
          reactions: (msgLike?.reactions ?? []).map((r) => ({ key: r.key, senders: r.senders.map((s) => s.senderId) })),
          ...(msgLike?.inReplyTo && { replyTo: replyOf(msgLike.inReplyTo) }),
        };
        const media = mediaContent(message.msgType);
        if (media) return { ...media, ...extras } as ItemContent;
        const text = ["Image", "Video", "Audio", "File"].includes(message.msgType.tag) ? null : messageBody(message.msgType);
        if (!text) return { type: "unsupported", description: message.msgType.tag };
        return { type: "text", body: text.body, ...(text.formatted && { formattedBody: text.formatted }), ...extras };
      }
      if (kind?.tag === "UnableToDecrypt") return { type: "undecryptable" };
      if (kind?.tag === "Redacted") return { type: "redacted" };
      return { type: "unsupported", description: kind?.tag ?? "Message" };
    }
    case "RoomMembership": {
      const i = raw.inner ?? {};
      const change = typeof i["change"] === "number" ? MEMBERSHIP_CHANGES[i["change"]] : (i["change"] as MembershipChange | undefined);
      return { type: "membership", userId: str(i["userId"]) ?? "", userName: str(i["userDisplayName"]), change };
    }
    case "State": {
      const state = raw.inner?.["content"] as Tagged | undefined;
      const value = str(state?.inner?.["name"]) ?? str(state?.inner?.["topic"]);
      const change: StateChange = { kind: state?.tag ?? "", value };
      return { type: "state", state: change };
    }
    case "ProfileChange":
      // Someone's name or picture changed: the other engine shows nothing for it, and neither do we (a state of a kind
      // `stateText` has no line for).
      return { type: "state", state: { kind: "ProfileChange" } };
    default:
      return { type: "unsupported", description: raw.tag };
  }
}

/** The SDK's event as a plain one. */
export function readEvent(e: RawEvent): EventItemLike {
  const id = e.eventOrTransactionId;
  const profile = profileOf(e.senderProfile);
  const send = e.localSendState?.tag;
  return {
    ...(id.tag === "EventId" && { eventId: str(id.inner?.["eventId"]) }),
    ...(id.tag === "TransactionId" && { transactionId: str(id.inner?.["transactionId"]) }),
    sender: e.sender,
    senderName: profile.name,
    senderAvatar: profile.avatar,
    isOwn: e.isOwn,
    timestamp: Number(e.timestamp),
    // An event with no local send state is from the server; a local one is waiting, failed, or sent and echoed.
    sendState: send === "NotSentYet" || send === "SendingFailed" || send === "Sent" ? send : undefined,
    readers: [...(e.readReceipts?.keys() ?? [])].map((userId) => ({ userId })),
    content: itemContent(e.content),
  };
}
