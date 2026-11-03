import { expect, test, vi } from "vitest";
import { t } from "@ohmatrix/i18n";
import { formatBubbleTime, typingLabel } from "./format.js";

const en = (k: Parameters<typeof t>[1], p?: Record<string, string | number>) => t("en", k, p);
const zh = (k: Parameters<typeof t>[1], p?: Record<string, string | number>) => t("zh-CN", k, p);

test("typing label wording", () => {
  expect(typingLabel([], en, false)).toBe("");
  expect(typingLabel(["Ann"], en, true)).toBe("typing...");
  expect(typingLabel(["Ann"], en, false)).toBe("Ann is typing...");
  expect(typingLabel(["Ann", "Bob"], en, false)).toBe("Ann and Bob are typing...");
  expect(typingLabel(["Ann", "Bob", "Cy", "Di"], en, false)).toBe("Ann and 3 others are typing...");
  expect(typingLabel(["Ann", "Bob"], zh, false)).toBe("Ann 和 Bob 正在输入...");
});

test("last-active times read the same without Intl.RelativeTimeFormat (Hermes has none)", async () => {
  vi.resetModules();
  const intl = Intl as { RelativeTimeFormat?: unknown };
  const real = intl.RelativeTimeFormat;
  intl.RelativeTimeFormat = undefined;
  try {
    const { formatRelative } = await import("./format.js");
    const now = Date.UTC(2026, 9, 16, 12);
    expect(formatRelative(now - 5_000, now, "en")).toBe("now");
    expect(formatRelative(now - 5 * 60_000, now, "en")).toBe("5 minutes ago");
    expect(formatRelative(now - 60_000, now, "en")).toBe("1 minute ago");
    expect(formatRelative(now - 3 * 3_600_000, now, "zh-CN")).toBe("3小时前");
    expect(formatRelative(now - 2 * 86_400_000, now, "zh-CN")).toBe("2天前");
    // Every language of the app has its words, with the plural forms where the language has them.
    const ago = (l: Parameters<typeof formatRelative>[2], ms: number) => formatRelative(now - ms, now, l);
    expect(ago("zh-TW", 5 * 60_000)).toBe("5分鐘前");
    expect(ago("es", 3_600_000)).toBe("hace 1 hora");
    expect(ago("es", 5 * 3_600_000)).toBe("hace 5 horas");
    expect(ago("fr", 2 * 86_400_000)).toBe("il y a 2 jours");
    expect(ago("de", 86_400_000)).toBe("vor 1 Tag");
    expect(ago("de", 3 * 86_400_000)).toBe("vor 3 Tagen");
    expect(ago("pt", 5 * 60_000)).toBe("há 5 minutos");
    expect(ago("it", 2 * 3_600_000)).toBe("2 ore fa");
    expect(ago("ja", 3 * 3_600_000)).toBe("3時間前");
    expect(ago("ko", 5 * 60_000)).toBe("5분 전");
    expect(ago("hi", 2 * 86_400_000)).toBe("2 दिन पहले");
    expect(ago("bn", 5 * 60_000)).toBe("5 মিনিট আগে");
    expect(ago("id", 3 * 3_600_000)).toBe("3 jam yang lalu");
    // Russian: 1 / 2-4 / 5-20, and 21 is like 1, 11 is like 5.
    expect(ago("ru", 60_000)).toBe("1 минуту назад");
    expect(ago("ru", 3 * 60_000)).toBe("3 минуты назад");
    expect(ago("ru", 11 * 60_000)).toBe("11 минут назад");
    expect(ago("ru", 21 * 60_000)).toBe("21 минуту назад");
    expect(ago("ru", 5 * 3_600_000)).toBe("5 часов назад");
    expect(ago("ru", 2 * 86_400_000)).toBe("2 дня назад");
  } finally {
    intl.RelativeTimeFormat = real;
  }
});

test("the time in a bubble is 24 hours in every language", () => {
  const afternoon = new Date(2026, 10, 3, 21, 5).getTime();
  const morning = new Date(2026, 10, 3, 9, 7).getTime();
  for (const locale of ["en", "zh-CN", "de", "ja"] as const) {
    expect(formatBubbleTime(afternoon, locale)).toBe("21:05");
    expect(formatBubbleTime(morning, locale)).toBe("09:07");
  }
});
