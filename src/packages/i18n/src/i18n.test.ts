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

test("the translated languages say it in their own words", () => {
  expect(t("es", "signIn")).toBe("Iniciar sesión");
  expect(t("fr", "signIn")).toBe("Se connecter");
  expect(t("de", "signIn")).toBe("Anmelden");
  expect(t("pt", "signIn")).toBe("Entrar");
  expect(t("it", "signIn")).toBe("Accedi");
  expect(t("it", "typing.two", { a: "A", b: "B" })).toBe("A e B stanno scrivendo...");
  expect(t("ru", "signIn")).toBe("Войти");
  expect(t("hi", "signIn")).toBe("साइन इन करें");
  expect(t("bn", "signIn")).toBe("সাইন ইন করুন");
  expect(t("id", "signIn")).toBe("Masuk");
  expect(t("ru", "typing.two", { a: "А", b: "Б" })).toBe("А и Б печатают...");
  // Russian counts are written as "Участников: {n}", the same for any number: no form that is wrong for 2, 5 or 21.
  for (const n of [1, 2, 5, 11, 21, 22, 100]) expect(t("ru", "members", { n })).toBe(`Участников: ${n}`);
  expect(t("ja", "signIn")).toBe("ログイン");
  expect(t("ko", "signIn")).toBe("로그인");
  expect(t("zh-TW", "signIn")).toBe("登入");
  expect(t("zh-TW", "members", { n: 3 })).toBe("3 位成員");
  expect(t("ko", "typing.many", { a: "A", n: 4 })).toBe("A님 외 4명이 입력 중...");
  // Written without spaces between words, the pieces of the sticker group warning are joined with none, and still read as one sentence.
  for (const l of ["ja", "ko", "zh-TW", "ru", "hi", "bn"] as const) {
    const whole = t(l, "sticker.group.delete.2a") + t(l, "sticker.group.delete.2b", { name: "X", n: 2 }) + t(l, "sticker.group.delete.2c");
    expect(whole).toContain("X");
    expect(whole).not.toMatch(/\{|\}/);
  }
  expect(t("de", "members", { n: 3 })).toBe("3 Mitglieder");
  expect(t("fr", "typing.two", { a: "A", b: "B" })).toBe("A et B sont en train d’écrire...");
  // The three pieces of the sticker group warning are read one after the other: the spaces at their ends are part of them.
  for (const l of ["en", "es", "fr", "de", "pt", "it"] as const) {
    const whole = t(l, "sticker.group.delete.2a") + t(l, "sticker.group.delete.2b", { name: "X", n: 2 }) + t(l, "sticker.group.delete.2c");
    expect(whole).not.toMatch(/\S\{|\}\S| {2}/);
    expect(whole).toContain("X");
  }
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
