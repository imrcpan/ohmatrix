import { expect, test } from "vitest";
import { stickerColumns, stickerWidth } from "./stickerColumns.js";

const g = { tile: 72, gap: 4, pad: 8, maxCols: 5 };

test("at most five columns, fewer when the room is short, the tiles and the space around them never changed", () => {
  expect(stickerColumns(g)).toBe(5);
  expect(stickerColumns(g, 1000)).toBe(5);
  expect(stickerColumns(g, 392)).toBe(5); // exactly five
  expect(stickerColumns(g, 391)).toBe(4);
  expect(stickerColumns(g, 344)).toBe(4);
  expect(stickerColumns(g, 240)).toBe(3);
  expect(stickerColumns(g, 10)).toBe(1);
  expect(stickerWidth(g, 5)).toBe(392);
  expect(stickerWidth(g, 4)).toBe(316);
});
