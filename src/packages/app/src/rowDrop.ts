/** The height of one row of a list that is reordered, and where its first row starts. */
export interface RowLayout {
  height: number;
  top: number;
}

/** The index a row dropped with its top at `y` goes to: the nearest row slot, kept inside the list. */
export function rowDropIndex(y: number, layout: RowLayout, count: number): number {
  if (count <= 0) return 0;
  return Math.max(0, Math.min(count - 1, Math.round((y - layout.top) / layout.height)));
}

/** The ids in the order that moving the one at `from` to `to` gives (the others keep their order). */
export function moved<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= items.length) return [...items];
  const out = [...items];
  const [one] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, one!);
  return out;
}
