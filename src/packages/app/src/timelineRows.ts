import type { Locale } from "@ohmatrix/i18n";
import type { TimelineItem } from "@ohmatrix/core";
import { formatDayLabel } from "./format.js";

export type Row =
  | { type: "date"; key: string; label: string }
  | { type: "service"; key: string; text: string }
  | { type: "unread"; key: string }
  | { type: "message"; key: string; item: TimelineItem; first: boolean; last: boolean };

const GROUP_GAP_MS = 5 * 60_000;
const dayKey = (ts: number) => new Date(ts).toDateString();

/** Oldest-first rows: date chips, service chips, and messages annotated with their position in a sender run. */
export function buildRows(items: readonly TimelineItem[], now: number, locale: Locale, firstUnreadId: string | null = null): Row[] {
  const rows: Row[] = [];
  const groupable = (a: TimelineItem, b: TimelineItem) =>
    a.content.kind !== "service" &&
    b.content.kind !== "service" &&
    a.sender === b.sender &&
    dayKey(a.ts) === dayKey(b.ts) &&
    Math.abs(b.ts - a.ts) <= GROUP_GAP_MS;

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
      });
  });
  return rows;
}
