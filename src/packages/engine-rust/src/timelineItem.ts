import type { MessageContent, ReactionSummary, TimelineItem } from "@ohmatrix/core";
import { membershipText, personName, stateText, type MembershipChange, type StateChange } from "./serviceText.js";

/**
 * The part of the SDK's `EventTimelineItem` a chat line is made from, with its enums as plain names (the converter that
 * builds this reads the bindings' tags and numbers; this file only knows the words).
 */
export interface EventItemLike {
  /** The event id once the server has it, else the id of the local echo. */
  eventId?: string | undefined;
  transactionId?: string | undefined;
  sender: string;
  /** The sender's profile, when the SDK has it. */
  senderName?: string | undefined;
  senderAvatar?: string | undefined;
  isOwn: boolean;
  /** Milliseconds since epoch. */
  timestamp: number;
  sendState?: "NotSentYet" | "SendingFailed" | "Sent" | undefined;
  /** People who have read up to here (not me). */
  readers?: { userId: string; name?: string | undefined }[] | undefined;
  content: ItemContent;
}

/** What every message has besides its words: edits, reactions and the message it answers. */
interface Extras {
  edited?: boolean | undefined;
  reactions?: ReactionLike[] | undefined;
  replyTo?: ReplyLike | undefined;
}

export type ItemContent =
  | ({ type: "text"; body: string; formattedBody?: string | undefined } & Extras)
  | ({ type: "image"; url: string; width?: number; height?: number; body: string; mimeType?: string; encryption?: string } & Extras)
  | ({ type: "file"; url: string; name: string; size?: number; mimeType?: string; encryption?: string } & Extras)
  | ({
      type: "video";
      url: string;
      name: string;
      width?: number;
      height?: number;
      durationMs?: number;
      size?: number;
      mimeType?: string;
      encryption?: string;
      thumbnail?: { url: string; encryption?: string };
    } & Extras)
  | ({
      type: "audio";
      url: string;
      name: string;
      durationMs?: number;
      size?: number;
      mimeType?: string;
      encryption?: string;
      voice?: boolean;
      waveform?: number[];
    } & Extras)
  | { type: "membership"; userId: string; userName?: string | undefined; change?: MembershipChange | undefined }
  | { type: "state"; state: StateChange }
  | { type: "undecryptable" }
  | { type: "redacted" }
  | { type: "unsupported"; description: string };

export interface ReactionLike {
  key: string;
  senders: string[];
}
export interface ReplyLike {
  eventId: string;
  /** Present when the SDK has the original. */
  original?: { sender: string; senderName?: string | undefined; body: string } | undefined;
}

/** The send state as our `status`. An event with no local state came from the server. */
export function statusOf(s: EventItemLike["sendState"]): TimelineItem["status"] {
  return s === "NotSentYet" ? "sending" : s === "SendingFailed" ? "failed" : "sent";
}

const reactionsOf = (rs: ReactionLike[] | undefined, me: string): ReactionSummary[] | undefined => {
  const out = (rs ?? []).filter((r) => r.senders.length > 0).map((r) => ({ key: r.key, count: r.senders.length, mine: r.senders.includes(me) }));
  return out.length ? out : undefined;
};

/**
 * A chat line from an event, or `null` for an event the chat does not show (a redacted message, a state change it has no
 * words for). `me` is my user id, to tell which reactions are mine.
 */
export function toTimelineItem(e: EventItemLike, roomId: string, me: string): TimelineItem | null {
  const sender = personName(e.senderName, e.sender);
  const base = {
    id: e.eventId ?? e.transactionId ?? "",
    ...(e.transactionId && { transactionId: e.transactionId }),
    roomId,
    sender: e.sender,
    senderName: sender,
    ...(e.senderAvatar && { senderAvatar: e.senderAvatar }),
    isOwn: e.isOwn,
    ts: e.timestamp,
    status: statusOf(e.sendState),
  };
  const c = e.content;
  let content: MessageContent | null = null;
  switch (c.type) {
    case "text":
      content = { kind: "text", body: c.body, ...(c.formattedBody && { formattedBody: c.formattedBody }) };
      break;
    case "image": {
      const { type: _t, edited: _e, reactions: _r, replyTo: _p, ...rest } = c;
      content = { kind: "image", ...rest };
      break;
    }
    case "file": {
      const { type: _t, edited: _e, reactions: _r, replyTo: _p, ...rest } = c;
      content = { kind: "file", ...rest };
      break;
    }
    case "video": {
      const { type: _t, edited: _e, reactions: _r, replyTo: _p, ...rest } = c;
      content = { kind: "video", ...rest };
      break;
    }
    case "audio": {
      const { type: _t, edited: _e, reactions: _r, replyTo: _p, ...rest } = c;
      content = { kind: "audio", ...rest };
      break;
    }
    case "membership": {
      const text = membershipText(c.change, personName(c.userName, c.userId), sender);
      content = text ? { kind: "service", body: text } : null;
      break;
    }
    case "state": {
      const text = stateText(c.state, sender);
      content = text ? { kind: "service", body: text } : null;
      break;
    }
    case "undecryptable":
      content = { kind: "undecryptable" };
      break;
    case "redacted":
      return null;
    case "unsupported":
      content = { kind: "unsupported", body: c.description };
      break;
  }
  if (!content) return null;
  const text = c.type === "text" || c.type === "image" || c.type === "file" || c.type === "video" || c.type === "audio" ? c : undefined;
  const reactions = reactionsOf(text?.reactions, me);
  const reply = text?.replyTo;
  const readBy = (e.readers ?? []).filter((r) => r.userId !== me).map((r) => ({ userId: r.userId, name: personName(r.name, r.userId) }));
  return {
    ...base,
    content,
    ...(reactions && { reactions }),
    ...(text?.edited && { edited: true }),
    ...(e.isOwn && readBy.length ? { readBy } : {}),
    ...(reply && {
      replyTo: {
        id: reply.eventId,
        sender: reply.original?.sender ?? "",
        senderName: reply.original ? personName(reply.original.senderName, reply.original.sender) : "",
        preview: reply.original?.body ?? "",
      },
    }),
  };
}
