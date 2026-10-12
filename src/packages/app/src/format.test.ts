import { expect, test } from "vitest";
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
