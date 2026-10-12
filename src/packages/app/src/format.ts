import type { Locale } from "@ohmatrix/i18n";
import { t } from "@ohmatrix/i18n";

const DAY = 86_400_000;
const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const formatClock = (ts: number, locale: Locale) => new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(ts);

/** Chat-list time: clock today, weekday within the week, short date otherwise. Empty if no activity. */
export function formatListTime(ts: number, now: number, locale: Locale): string {
  if (!ts) return "";
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
  if (days <= 0) return formatClock(ts, locale);
  if (days < 7) return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(ts);
  return new Intl.DateTimeFormat(locale, { year: "2-digit", month: "numeric", day: "numeric" }).format(ts);
}

/** Date separator label in the timeline. */
export function formatDayLabel(ts: number, now: number, locale: Locale): string {
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
  if (days <= 0) return t(locale, "today");
  if (days === 1) return t(locale, "yesterday");
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(
    locale,
    days < 7 ? { weekday: "long" } : sameYear ? { month: "long", day: "numeric" } : { year: "numeric", month: "long", day: "numeric" },
  ).format(ts);
}

export function formatBytes(n?: number): string {
  if (!n) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0,
    v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}

type Translate = (key: "typing.one" | "typing.two" | "typing.many" | "typing.short", params?: Record<string, string | number>) => string;

/** "Ann is typing...", "Ann and Bob are typing...", "Ann and 2 others are typing..." ("typing..." alone in direct chats). */
export function typingLabel(names: readonly string[], t: Translate, direct: boolean): string {
  if (names.length === 0) return "";
  if (direct) return t("typing.short");
  if (names.length === 1) return t("typing.one", { a: names[0]! });
  if (names.length === 2) return t("typing.two", { a: names[0]!, b: names[1]! });
  return t("typing.many", { a: names[0]!, n: names.length - 1 });
}
