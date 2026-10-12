import { expect, test } from "vitest";
import { truncateWithDots } from "./truncate.js";

const mono = (s: string) => s.length * 10; // 10px per char

test("text that fits is untouched", () => {
  expect(truncateWithDots("hello", 50, mono)).toBe("hello");
});

test("truncates so that text + three dots fits", () => {
  const out = truncateWithDots("abcdefghijklmnop", 100, mono);
  expect(out).toBe("abcdefg...");
  expect(mono(out)).toBeLessThanOrEqual(100);
});

test("uses three ASCII periods, never the ellipsis character, and trims trailing spaces", () => {
  const out = truncateWithDots("one two three four", 90, mono);
  expect(out.endsWith("...")).toBe(true);
  expect(out).not.toContain("…");
  expect(out).toBe("one tw...");
  expect(truncateWithDots("ab   cd", 50, mono)).toBe("ab...");
});

test("does not split emoji and handles tiny widths", () => {
  expect(truncateWithDots("👍👍👍👍👍👍", 40, (s) => Array.from(s).length * 10)).toBe("👍...");
  expect(truncateWithDots("anything", 0, mono)).toBe("anything");
});
