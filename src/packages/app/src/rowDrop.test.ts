import { expect, test } from "vitest";
import { moved, rowDropIndex } from "./rowDrop.js";

const layout = { height: 64, top: 10 };

test("a row dropped nearer to another slot goes there, and never outside the list", () => {
  expect(rowDropIndex(10, layout, 4)).toBe(0);
  expect(rowDropIndex(10 + 64 * 1 + 20, layout, 4)).toBe(1); // 20 px past slot 1: still slot 1
  expect(rowDropIndex(10 + 64 * 1 + 40, layout, 4)).toBe(2); // 40 px past: nearer to slot 2
  expect(rowDropIndex(-500, layout, 4)).toBe(0);
  expect(rowDropIndex(5000, layout, 4)).toBe(3);
  expect(rowDropIndex(30, layout, 0)).toBe(0);
});

test("moving a row puts it at the place asked for and leaves the others in order", () => {
  expect(moved(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  expect(moved(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
  expect(moved(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  expect(moved(["a", "b", "c"], 5, 0)).toEqual(["a", "b", "c"]);
  expect(moved(["a", "b", "c"], 0, 9)).toEqual(["b", "c", "a"]);
});
