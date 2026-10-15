import type { ListUpdate, RoomSummary, TimelineItem } from "@ohmatrix/core";

const key = (i: TimelineItem) => i.transactionId ?? i.id;

function equal(a: TimelineItem, b: TimelineItem): boolean {
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.ts === b.ts &&
    a.senderName === b.senderName &&
    JSON.stringify(a.content) === JSON.stringify(b.content) &&
    JSON.stringify(a.reactions) === JSON.stringify(b.reactions) &&
    JSON.stringify(a.replyTo) === JSON.stringify(b.replyTo) &&
    a.edited === b.edited &&
    a.pinned === b.pinned &&
    JSON.stringify(a.readBy) === JSON.stringify(b.readBy) &&
    JSON.stringify(a.upload) === JSON.stringify(b.upload)
  );
}

/** Minimal updates turning `prev` into `next`: in-place `set`s + tail `insert`s, else `reset`. */
export function diffTimeline(prev: readonly TimelineItem[], next: readonly TimelineItem[]): ListUpdate<TimelineItem>[] {
  const prefix = prev.length <= next.length && prev.every((p, i) => key(p) === key(next[i]!));
  if (!prefix) return [{ op: "reset", items: [...next] }];
  const out: ListUpdate<TimelineItem>[] = [];
  prev.forEach((p, i) => {
    if (!equal(p, next[i]!)) out.push({ op: "set", index: i, item: next[i]! });
  });
  for (let i = prev.length; i < next.length; i++) out.push({ op: "insert", index: i, item: next[i]! });
  return out;
}

/** What of a timeline item a chat list row shows or depends on (the last message, but not its read markers). */
function sameItem(a: TimelineItem | undefined, b: TimelineItem | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.status === b.status &&
    a.ts === b.ts &&
    a.senderName === b.senderName &&
    a.isOwn === b.isOwn &&
    JSON.stringify(a.content) === JSON.stringify(b.content)
  );
}

function sameRoom(a: RoomSummary, b: RoomSummary): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.avatar === b.avatar &&
    a.invite?.inviter === b.invite?.inviter &&
    a.muted === b.muted &&
    a.pinned === b.pinned &&
    a.markedUnread === b.markedUnread &&
    a.isDirect === b.isDirect &&
    a.isSpace === b.isSpace &&
    a.memberCount === b.memberCount &&
    a.unreadCount === b.unreadCount &&
    a.highlightCount === b.highlightCount &&
    a.lastActivityTs === b.lastActivityTs &&
    (a.typing?.join("\n") ?? "") === (b.typing?.join("\n") ?? "") &&
    sameItem(a.lastMessage, b.lastMessage)
  );
}

/**
 * The new room list, with the previous object kept for every room that did not change. The chat list draws a row again
 * only when its object is a different one, so a sync that touches ten rooms of three hundred redraws ten.
 */
export function reuseRooms(prev: readonly RoomSummary[], next: readonly RoomSummary[]): RoomSummary[] {
  if (!prev.length) return [...next];
  const before = new Map(prev.map((r) => [r.id, r]));
  return next.map((r) => {
    const old = before.get(r.id);
    return old && sameRoom(old, r) ? old : r;
  });
}
