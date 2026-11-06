/**
 * The interface languages, each with its name in its own language (never translated). The first is the fallback of every other: a text that a
 * language does not have yet is shown in English, so a language can be added before it is complete.
 *
 * Generated from locales/*.toml by codegen.ts.
 */
import { LANGUAGES as LANGS, en as enCatalog, catalogs as allCatalogs } from "./generated.js";

export const LANGUAGES = LANGS;
export const en = enCatalog;
const catalogs = allCatalogs;

export type Locale = (typeof LANGUAGES)[number]["id"];

/** Whether `id` is one of the languages above (a saved preference may name one this version does not have). */
export function isLocale(id: unknown): id is Locale {
  return typeof id === "string" && LANGUAGES.some((l) => l.id === id);
}

export type MessageKey = keyof typeof en;

/** Whether `locale` has texts of its own (English always does; a language of the list may not yet). */
export function hasCatalog(locale: Locale): boolean {
  return catalogs[locale] !== undefined;
}

/**
 * The language to use for a system language tag (`fr-CA`, `zh-Hant-HK`, `pt_BR`): the one of the same language, else English. Chinese is
 * split by script or region: Traditional for `zh-Hant`, `zh-TW`, `zh-HK` and `zh-MO`, Simplified for any other.
 */
export function detectLocale(tag: string | undefined): Locale {
  const parts = (tag ?? "").toLowerCase().replace(/_/g, "-").split("-");
  const language = parts[0] ?? "";
  if (language === "zh") {
    const traditional = parts.includes("hant") || parts.some((p) => p === "tw" || p === "hk" || p === "mo");
    return traditional ? "zh-TW" : "zh-CN";
  }
  // Indonesian was `in` in Java's old tags.
  const id = language === "in" ? "id" : language;
  return LANGUAGES.find((l) => l.id === id)?.id ?? "en";
}

/** Translates `key`; a missing translation falls back to English and then to the key itself, never to an exception. */
export function t(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string {
  const s = catalogs[locale]?.[key] ?? en[key] ?? String(key);
  return params ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? "")) : s;
}
