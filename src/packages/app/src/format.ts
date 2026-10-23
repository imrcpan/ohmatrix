import type { Locale } from "@ohmatrix/i18n";
import { t } from "@ohmatrix/i18n";

const DAY = 86_400_000;
const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/**
 * Building an Intl formatter is the expensive part of formatting a date (about as much as a few hundred formats), and
 * a chat list formats one for every row on every update. So each (locale, options) pair is built once.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();
function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    formatters.set(key, f);
  }
  return f;
}
type Unit = "minute" | "hour" | "day";

/** The plural form of a count in Russian: 1, 21 (one); 2-4, 22-24 (few); the rest (many). */
const ruForm = (n: number): 0 | 1 | 2 => {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? 0 : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 1 : 2;
};

/**
 * What `Intl.RelativeTimeFormat` does for the languages the app has, for runtimes without it (Hermes on Android): the word for "now" and
 * how long ago, by the unit. Languages with one form for every count (Chinese, Japanese, Korean, Indonesian) write the count and the unit;
 * the others pick the form of the unit for the count.
 */
const RELATIVE: Record<Locale, { now: string; ago: (n: number, unit: Unit) => string }> = {
  en: { now: "now", ago: (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"} ago` },
  "zh-CN": { now: "现在", ago: (n, unit) => `${n}${{ minute: "分钟", hour: "小时", day: "天" }[unit]}前` },
  "zh-TW": { now: "現在", ago: (n, unit) => `${n}${{ minute: "分鐘", hour: "小時", day: "天" }[unit]}前` },
  es: {
    now: "ahora",
    ago: (n, unit) => `hace ${n} ${{ minute: n === 1 ? "minuto" : "minutos", hour: n === 1 ? "hora" : "horas", day: n === 1 ? "día" : "días" }[unit]}`,
  },
  fr: {
    now: "maintenant",
    ago: (n, unit) => `il y a ${n} ${{ minute: n > 1 ? "minutes" : "minute", hour: n > 1 ? "heures" : "heure", day: n > 1 ? "jours" : "jour" }[unit]}`,
  },
  de: {
    now: "jetzt",
    ago: (n, unit) => `vor ${n} ${{ minute: n === 1 ? "Minute" : "Minuten", hour: n === 1 ? "Stunde" : "Stunden", day: n === 1 ? "Tag" : "Tagen" }[unit]}`,
  },
  pt: {
    now: "agora",
    ago: (n, unit) => `há ${n} ${{ minute: n === 1 ? "minuto" : "minutos", hour: n === 1 ? "hora" : "horas", day: n === 1 ? "dia" : "dias" }[unit]}`,
  },
  it: {
    now: "ora",
    ago: (n, unit) => `${n} ${{ minute: n === 1 ? "minuto" : "minuti", hour: n === 1 ? "ora" : "ore", day: n === 1 ? "giorno" : "giorni" }[unit]} fa`,
  },
  ru: {
    now: "сейчас",
    ago: (n, unit) => {
      const f = ruForm(n);
      const word = {
        minute: ["минуту", "минуты", "минут"],
        hour: ["час", "часа", "часов"],
        day: ["день", "дня", "дней"],
      }[unit][f];
      return `${n} ${word} назад`;
    },
  },
  ja: { now: "たった今", ago: (n, unit) => `${n}${{ minute: "分", hour: "時間", day: "日" }[unit]}前` },
  ko: { now: "지금", ago: (n, unit) => `${n}${{ minute: "분", hour: "시간", day: "일" }[unit]} 전` },
  hi: { now: "अभी", ago: (n, unit) => `${n} ${{ minute: "मिनट", hour: "घंटे", day: "दिन" }[unit]} पहले` },
  bn: { now: "এখন", ago: (n, unit) => `${n} ${{ minute: "মিনিট", hour: "ঘণ্টা", day: "দিন" }[unit]} আগে` },
  id: { now: "sekarang", ago: (n, unit) => `${n} ${{ minute: "menit", hour: "jam", day: "hari" }[unit]} yang lalu` },
};

type Relative = { format(value: number, unit: "second" | "minute" | "hour" | "day"): string };
const relativeFormatters = new Map<string, Relative>();
function relativeFormat(locale: Locale): Relative {
  let f = relativeFormatters.get(locale);
  if (!f) {
    const Native = (Intl as { RelativeTimeFormat?: new (l: string, o: { numeric: "auto" }) => Relative }).RelativeTimeFormat;
    const words = RELATIVE[locale] ?? RELATIVE.en;
    f = Native ? new Native(locale, { numeric: "auto" }) : { format: (value, unit) => (unit === "second" ? words.now : words.ago(-value, unit)) };
    relativeFormatters.set(locale, f);
  }
  return f;
}

export const formatClock = (ts: number, locale: Locale) => dateFormat(locale, { hour: "numeric", minute: "2-digit" }).format(ts);

/** Chat-list time: clock today, weekday within the week, short date otherwise. Empty if no activity. */
export function formatListTime(ts: number, now: number, locale: Locale): string {
  if (!ts) return "";
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
  if (days <= 0) return formatClock(ts, locale);
  if (days < 7) return dateFormat(locale, { weekday: "short" }).format(ts);
  return dateFormat(locale, { year: "2-digit", month: "numeric", day: "numeric" }).format(ts);
}

/** Date separator label in the timeline. */
export function formatDayLabel(ts: number, now: number, locale: Locale): string {
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
  if (days <= 0) return t(locale, "today");
  if (days === 1) return t(locale, "yesterday");
  const sameYear = new Date(ts).getFullYear() === new Date(now).getFullYear();
  return dateFormat(
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

/** "just now", "5 minutes ago", "yesterday", or a date: for "last active". */
export function formatRelative(ts: number, now: number, locale: Locale): string {
  const diff = now - ts;
  const rtf = relativeFormat(locale);
  if (diff < 60_000) return rtf.format(0, "second");
  if (diff < 3_600_000) return rtf.format(-Math.floor(diff / 60_000), "minute");
  if (diff < 86_400_000) return rtf.format(-Math.floor(diff / 3_600_000), "hour");
  if (diff < 7 * 86_400_000) return rtf.format(-Math.floor(diff / 86_400_000), "day");
  return dateFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(ts);
}
