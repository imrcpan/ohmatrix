import { expect, test } from "vitest";
import { dropIndex } from "./dropIndex.js";

// Four columns: cells are 76 apart, the first at 8.
test("a dropped tile goes to the nearest cell, kept inside the grid", () => {
  expect(dropIndex(8, 8, 4, 10)).toBe(0);
  expect(dropIndex(8 + 76 * 2 + 10, 8 + 20, 4, 10)).toBe(2);
  expect(dropIndex(8, 8 + 76, 4, 10)).toBe(4);
  expect(dropIndex(8 + 76 * 3, 8 + 76 * 2, 4, 10)).toBe(9); // past the last tile: the last
  expect(dropIndex(-50, -50, 4, 10)).toBe(0);
  expect(dropIndex(900, 8, 4, 10)).toBe(3);
});
