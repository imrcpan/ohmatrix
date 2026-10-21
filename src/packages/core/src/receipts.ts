import type { Reader, TimelineItem } from "./types.js";

/**
 * A read receipt covers every message before the one it sits on, but an engine may only say which receipts sit on a message. So the
 * receipts are carried towards the older messages: each of my own messages that is on the server is read by everyone whose receipt is on
 * it or on a later message. (Without this, a message looked unread as soon as the other person read a newer one.)
 * `items` are oldest first; an item that needs no change is returned as it is.
 */
export function spreadReceipts(items: readonly TimelineItem[]): TimelineItem[] {
  const seen = new Map<string, Reader>();
  const out = items.slice();
  for (let i = items.length - 1; i >= 0; i--) {
    const m = items[i]!;
    for (const r of m.readBy ?? []) if (!seen.has(r.userId)) seen.set(r.userId, r);
    if (!m.isOwn || m.status !== "sent" || seen.size === 0) continue;
    const have = m.readBy ?? [];
    if (have.length === seen.size && have.every((r) => seen.has(r.userId))) continue;
    out[i] = { ...m, readBy: [...seen.values()] };
  }
  return out;
}
