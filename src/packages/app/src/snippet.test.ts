import { expect, test } from "vitest";
import { makeSnippet } from "./snippet.js";

test("short text is kept whole around the match", () => {
  expect(makeSnippet("The quick brown fox", "quick")).toEqual({ before: "The ", match: "quick", after: " brown fox" });
});

test("the match keeps the original case and long text is cut with three dots", () => {
  const text = `${"a".repeat(80)} NEEDLE ${"b".repeat(80)}`;
  const s = makeSnippet(text, "needle", 10);
  expect(s.match).toBe("NEEDLE");
  expect(s.before.startsWith("...")).toBe(true);
  expect(s.after.endsWith("...")).toBe(true);
  expect(s.before.length + s.match.length + s.after.length).toBeLessThan(40);
  expect(s.before + s.match + s.after).not.toContain("…");
});

test("whitespace is collapsed and a missing term shows the start", () => {
  expect(makeSnippet("line one\n\n  line   two", "two")).toEqual({ before: "line one line ", match: "two", after: "" });
  expect(makeSnippet("hello world", "zzz")).toEqual({ before: "", match: "", after: "hello world" });
  expect(makeSnippet("x".repeat(200), "q").after.endsWith("...")).toBe(true);
});
