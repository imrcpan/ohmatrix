import { expect, test } from "vitest";
import type { Row } from "../timelineRows.js";
import { earlierStart, estimateRowHeight, initialStart } from "./rowWindow.js";

const text = (i: number, body = "hello"): Row => ({
  type: "message",
  key: `m${i}`,
  first: true,
  last: true,
  newSender: false,
  item: { id: `$${i}`, sender: "@a:x", ts: i, isOwn: false, content: { kind: "text", body } } as never,
});
const many = (n: number) => Array.from({ length: n }, (_, i) => text(i));

test("a long history starts well inside it, a short one at its first row", () => {
  const long = many(500);
  const start = initialStart(long, 800, 1000);
  expect(start).toBeGreaterThan(400);
  expect(start).toBeLessThan(499);
  expect(initialStart(many(3), 800, 1000)).toBe(0);
  expect(initialStart([], 800, 1000)).toBe(0);
});

test("the window holds at least 1.5 screens even by an overestimate", () => {
  const rows = many(500);
  const start = initialStart(rows, 800, 1000);
  const guess = rows.slice(start).reduce((n, r) => n + estimateRowHeight(r, 1000), 0);
  expect(guess).toBeGreaterThanOrEqual(800 * 1.5);
});

test("longer messages take more room, so fewer are drawn", () => {
  const short = initialStart(many(500), 800, 1000);
  const longRows = Array.from({ length: 500 }, (_, i) => text(i, "word ".repeat(200)));
  expect(initialStart(longRows, 800, 1000)).toBeGreaterThan(short);
});

test("earlier chunks step back and stop at the first row", () => {
  const rows = many(500);
  let start = initialStart(rows, 800, 1000);
  let steps = 0;
  while (start > 0 && steps++ < 100) {
    const next = earlierStart(rows, start, 800, 1000);
    expect(next).toBeLessThan(start);
    start = next;
  }
  expect(start).toBe(0);
});
