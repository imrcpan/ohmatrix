/** How many columns the sticker grid has: as many as fit in `available` px (at most `maxCols`), with the tile size and the space between and around them unchanged. */
export function stickerColumns(g: { tile: number; gap: number; pad: number; maxCols: number }, available = Infinity): number {
  return Math.max(1, Math.min(g.maxCols, Math.floor((available - 2 * g.pad + g.gap) / (g.tile + g.gap))));
}

/** The width of a picker with `cols` columns. */
export const stickerWidth = (g: { tile: number; gap: number; pad: number }, cols: number): number => cols * (g.tile + g.gap) - g.gap + 2 * g.pad;
