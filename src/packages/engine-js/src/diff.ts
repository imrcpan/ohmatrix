import type { ListUpdate, TimelineItem } from "@ohmatrix/core";

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
    JSON.stringify(a.readBy) === JSON.stringify(b.readBy)
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
