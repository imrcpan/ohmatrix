import { STICKER_GAP, STICKER_PAD, STICKER_TILE } from "./stickerGrid.js";

const PITCH = STICKER_TILE + STICKER_GAP;

/** The index a tile dropped with its top left at (x, y) goes to: the nearest cell, kept inside the grid. */
export function dropIndex(x: number, y: number, cols: number, count: number): number {
  const col = Math.max(0, Math.min(cols - 1, Math.round((x - STICKER_PAD) / PITCH)));
  const row = Math.max(0, Math.round((y - STICKER_PAD) / PITCH));
  return Math.min(count - 1, row * cols + col);
}
