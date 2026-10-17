import type { Locale } from "@ohmatrix/i18n";
import type { TimelineItem } from "@ohmatrix/core";
import { formatDayLabel } from "./format.js";

export type Row =
  | { type: "date"; key: string; label: string }
  | { type: "service"; key: string; text: string }
  | { type: "unread"; key: string }
  | { type: "message"; key: string; item: TimelineItem; first: boolean; last: boolean; newSender: boolean; stickAbove: boolean; stickBelow: boolean };

const GROUP_GAP_MS = 5 * 60_000;
const dayKey = (ts: number) => new Date(ts).toDateString();

/** Oldest-first rows: date chips, service chips, and messages annotated with their position in a sender run. */
export function buildRows(items: readonly TimelineItem[], now: number, locale: Locale, firstUnreadId: string | null = null): Row[] {
  const rows: Row[] = [];
  // A file is a card of its own: it neither joins the run before it nor lets the next message join it.
  const groupable = (a: TimelineItem, b: TimelineItem) =>
    a.content.kind !== "service" &&
    b.content.kind !== "service" &&
    a.content.kind !== "file" &&
    b.content.kind !== "file" &&
    a.sender === b.sender &&
    dayKey(a.ts) === dayKey(b.ts) &&
    Math.abs(b.ts - a.ts) <= GROUP_GAP_MS;

  // Only a text bubble (a quote in it does not matter) sticks to its neighbours by the corners: any other kind neither
  // sticks to one nor is stuck to.
  const plain = (i: TimelineItem) => i.content.kind === "text";

  items.forEach((item, i) => {
    const prev = items[i - 1],
      next = items[i + 1];
    if (!prev || dayKey(prev.ts) !== dayKey(item.ts)) {
      rows.push({ type: "date", key: `d-${dayKey(item.ts)}`, label: formatDayLabel(item.ts, now, locale) });
    }
    if (firstUnreadId && item.id === firstUnreadId) rows.push({ type: "unread", key: "unread-divider" });
    const key = item.transactionId ?? item.id;
    if (item.content.kind === "service") rows.push({ type: "service", key, text: item.content.body });
    else
      rows.push({
        type: "message",
        key,
        item,
        first: !prev || !groupable(prev, item) || item.id === firstUnreadId,
        last: !next || !groupable(item, next) || next.id === firstUnreadId,
        stickAbove: !!prev && item.id !== firstUnreadId && groupable(prev, item) && plain(prev) && plain(item),
        stickBelow: !!next && next.id !== firstUnreadId && groupable(item, next) && plain(item) && plain(next),
        // Directly under a bubble of someone else: the gap is tripled.
        newSender: !!prev && prev.content.kind !== "service" && prev.sender !== item.sender && dayKey(prev.ts) === dayKey(item.ts),
      });
  });
  return rows;
}
