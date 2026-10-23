import { expect, test } from "vitest";
import { detectLocale, isLocale, LANGUAGES, t } from "./index.js";

test("t", () => {
  expect(t("en", "members", { n: 3 })).toBe("3 members");
  expect(t("zh-CN", "chats")).toBe("聊天");
});

test("a missing translation never throws", () => {
  expect(t("en", "nope.nothing" as never)).toBe("nope.nothing");
  expect(t("zh-CN", "nope.nothing" as never, { n: 1 })).toBe("nope.nothing");
  expect(t("xx" as never, "chats")).toBe("Chats");
});

test("a language without a text yet shows it in English, with its values filled in", () => {
  // Every language of the list is known, translated or not; one that has nothing yet is English.
  for (const l of LANGUAGES) expect(t(l.id, "members", { n: 7 })).toMatch(/7/);
  expect(t("fr", "chats").length).toBeGreaterThan(0);
});

test("the language follows the system's tag: the same language, Chinese by script or region, English for the rest", () => {
  expect(detectLocale("en-US")).toBe("en");
  expect(detectLocale("fr")).toBe("fr");
  expect(detectLocale("fr-CA")).toBe("fr");
  expect(detectLocale("pt_BR")).toBe("pt");
  expect(detectLocale("PT-pt")).toBe("pt");
  expect(detectLocale("ja-JP")).toBe("ja");
  expect(detectLocale("ko")).toBe("ko");
  expect(detectLocale("hi-IN")).toBe("hi");
  expect(detectLocale("bn-BD")).toBe("bn");
  expect(detectLocale("in")).toBe("id"); // Java's old tag for Indonesian
  expect(detectLocale("id-ID")).toBe("id");
  expect(detectLocale("zh")).toBe("zh-CN");
  expect(detectLocale("zh-Hans-CN")).toBe("zh-CN");
  expect(detectLocale("zh-SG")).toBe("zh-CN");
  expect(detectLocale("zh-TW")).toBe("zh-TW");
  expect(detectLocale("zh-HK")).toBe("zh-TW");
  expect(detectLocale("zh-Hant")).toBe("zh-TW");
  expect(detectLocale("zh-Hant-TW")).toBe("zh-TW");
  expect(detectLocale("ar")).toBe("en"); // not offered
  expect(detectLocale("ur")).toBe("en");
  expect(detectLocale(undefined)).toBe("en");
  expect(detectLocale("")).toBe("en");
});

test("a saved language is used only when this version has it", () => {
  expect(isLocale("zh-TW")).toBe(true);
  expect(isLocale("es")).toBe(true);
  expect(isLocale("ur")).toBe(false);
  expect(isLocale(null)).toBe(false);
  expect(isLocale(42)).toBe(false);
});

test("the languages are listed once each, in their own names", () => {
  expect(new Set(LANGUAGES.map((l) => l.id)).size).toBe(LANGUAGES.length);
  expect(LANGUAGES[0]!.id).toBe("en");
  expect(LANGUAGES.map((l) => l.label)).toContain("繁體中文");
});
