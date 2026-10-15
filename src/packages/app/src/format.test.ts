import { expect, test, vi } from "vitest";
import { t } from "@ohmatrix/i18n";
import { typingLabel } from "./format.js";

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
  } finally {
    intl.RelativeTimeFormat = real;
  }
});
