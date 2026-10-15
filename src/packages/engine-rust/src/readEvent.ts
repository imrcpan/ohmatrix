import type { EventItemLike, ItemContent } from "./timelineItem.js";
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

/** The wording of a `MessageContent`'s body: text-like messages as text, media as their file name. */
function messageBody(msgType: Tagged): { body: string; formatted?: string | undefined } | null {
  const c = msgType.inner?.["content"] as Record<string, unknown> | undefined;
  switch (msgType.tag) {
    case "Text":
    case "Notice":
    case "Emote": {
      const f = c?.["formatted"] as { body?: string } | undefined;
      return { body: str(c?.["body"]) ?? "", formatted: f?.body };
    }
    default:
      return null;
  }
}

function itemContent(raw: Tagged): ItemContent {
  switch (raw.tag) {
    case "MsgLike": {
      const msgLike = raw.inner?.["content"] as
        { kind: Tagged; reactions?: { key: string; senders: { senderId: string }[] }[]; inReplyTo?: unknown } | undefined;
      const kind = msgLike?.kind;
      if (kind?.tag === "Message") {
        const message = kind.inner?.["content"] as { msgType: Tagged; isEdited?: boolean } | undefined;
        const text = message ? messageBody(message.msgType) : null;
        if (!message || !text) return { type: "unsupported", description: message?.msgType.tag ?? "Message" };
        return {
          type: "text",
          body: text.body,
          ...(text.formatted && { formattedBody: text.formatted }),
          ...(message.isEdited && { edited: true }),
          reactions: (msgLike?.reactions ?? []).map((r) => ({ key: r.key, senders: r.senders.map((s) => s.senderId) })),
        };
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
