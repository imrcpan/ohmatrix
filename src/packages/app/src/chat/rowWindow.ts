import { fit } from "./mediaSize.js";
import type { Row } from "../timelineRows.js";

/** How many screens of messages are drawn at first; the rest of what is loaded follows once the chat is showing. */
export const INITIAL_SCREENS = 1.5;
/**
 * Heights are guessed, and a guess that is too high would leave the first screen short. So the guesses are scaled down
 * a little: the window then holds a bit more than it needs, never less.
 */
const SAFETY = 0.8;

/** The space above a message bubble. Bubbles stick by their corners, not by the gap. */
export const BUBBLE_GAP = 2;

/** The space above a bubble: the plain gap, three times that when the bubble above is someone else's. */
export const gapAbove = (newSender: boolean) => (newSender ? 3 * BUBBLE_GAP : BUBBLE_GAP);

/** A rough height of a row in px, good enough to choose how many rows to draw first (the real height is measured). */
export function estimateRowHeight(row: Row, width: number): number {
  if (row.type === "date" || row.type === "unread") return 36;
  if (row.type === "service") return 32;
  const c = row.item.content;
  const gap = gapAbove(row.newSender);
  const bubble = 16 + 8; // padding of the bubble, and the time line
  switch (c.kind) {
    case "text": {
      const perLine = Math.max(10, Math.floor((Math.min(width, 640) * 0.7) / 8));
      const lines = c.body.split("\n").reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
      const preview = c.previews?.length ? 120 : 0;
      return gap + bubble + lines * 20 + preview + (row.first ? 18 : 0);
    }
    case "image":
    case "video":
      return gap + 8 + fit(c.width, c.height).height;
    case "audio":
      return gap + 52;
    case "file":
      return gap + 88; // a card of fixed height
    default:
      return gap + 44;
  }
}

/**
 * The index of the oldest row to draw so that the rows from there to the end add up to about `screens` windows of
 * `view` px (by the guesses above). Always at least one row.
 */
export function initialStart(rows: readonly Row[], view: number, width: number, screens = INITIAL_SCREENS): number {
  const want = view * screens;
  let sum = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    sum += estimateRowHeight(rows[i]!, width) * SAFETY;
    if (sum >= want) return i;
  }
  return 0;
}

/** The start of the next, older chunk: about `screens` more windows, never past the first row. */
export function earlierStart(rows: readonly Row[], start: number, view: number, width: number, screens = INITIAL_SCREENS): number {
  const want = view * screens;
  let sum = 0;
  for (let i = start - 1; i >= 0; i--) {
    sum += estimateRowHeight(rows[i]!, width) * SAFETY;
    if (sum >= want) return i;
  }
  return 0;
}
