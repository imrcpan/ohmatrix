import { expect, test } from "vitest";
import { LANGUAGES, t, type Locale, type MessageKey } from "@ohmatrix/i18n";

/** The words of a notification, as keys of the texts of the app: what the Kotlin side of the push service looks up by language. */
const WORDS: ReadonlyArray<readonly [field: string, key: MessageKey]> = [
  ["photo", "push.photo"],
  ["video", "push.video"],
  ["voice", "push.voice"],
  ["audio", "push.audio"],
  ["file", "push.file"],
  ["location", "push.location"],
  ["invited", "push.invited"],
  ["newMessage", "notif.new"],
];

/** A Kotlin string: quotes, backslashes and `$` (which starts a template) are written out. */
const kotlin = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$")}"`;

const source = (): string => {
  const entry = (l: Locale) =>
    [`        "${l}" to`, "            PushWords(", ...WORDS.map(([field, key]) => `                ${field} = ${kotlin(t(l, key))},`), "            ),"].join(
      "\n",
    );
  return [
    "package org.ohmatrix.push",
    "",
    "// Generated from the texts of @ohmatrix/i18n by src/pushWords.test.ts: do not edit it by hand. After a text changes, run",
    "// `pnpm --filter @ohmatrix/mobile exec vitest run pushWords -u` and commit the result.",
    "",
    "/** The words of a notification that the service writes while the app is not running. `invited` has `{name}` where the person goes. */",
    "internal class PushWords(",
    ...WORDS.map(([field]) => `    val ${field}: String,`),
    ")",
    "",
    "/** By language, as the app names them (`zh-TW`, `pt`): the app hands over the one in use (see pushState.ts). */",
    "internal val PUSH_WORDS: Map<String, PushWords> =",
    "    mapOf(",
    LANGUAGES.map((l) => entry(l.id)).join("\n"),
    "    )",
    "",
  ].join("\n");
};

test("the Kotlin words of the push service are the ones of the app's texts, in every language", async () => {
  await expect(source()).toMatchFileSnapshot("../modules/ohmatrix-push/android/src/main/java/org/ohmatrix/push/PushWords.kt");
});

test("every language has every word, and the invitation says who invited", () => {
  for (const l of LANGUAGES) {
    for (const [, key] of WORDS) expect(t(l.id, key).trim(), `${l.id} ${key}`).not.toBe("");
    expect(t(l.id, "push.invited"), l.id).toContain("{name}");
  }
});
