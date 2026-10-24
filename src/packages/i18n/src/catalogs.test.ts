import { expect, test } from "vitest";
import { en, hasCatalog, LANGUAGES, t, type MessageKey } from "./index.js";

const KEYS = Object.keys(en) as MessageKey[];
const values = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("a language with texts has every text of English, none empty, and the same {values} in each", () => {
  const have = LANGUAGES.map((l) => l.id).filter(hasCatalog);
  for (const id of ["zh-CN", "es", "fr", "de", "pt", "it"] as const) expect(have).toContain(id);
  const problems: string[] = [];
  for (const id of have) {
    for (const k of KEYS) {
      const text = t(id, k);
      if (!text.trim()) problems.push(`${id}: ${k} is empty`);
      if (JSON.stringify(values(text)) !== JSON.stringify(values(en[k])))
        problems.push(`${id}: ${k} has ${JSON.stringify(values(text))}, English ${JSON.stringify(values(en[k]))}`);
    }
  }
  expect(problems).toEqual([]);
});
