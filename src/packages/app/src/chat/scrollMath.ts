/**
 * The decisions a message list makes about scrolling, as pure functions of numbers (no DOM, no React), so they can be
 * tested. Offsets are in the natural direction: 0 at the oldest loaded message, `content - view` at the newest.
 */

/** Within this many pixels of the end counts as "at the bottom". */
export const BOTTOM_SLACK = 48;

/** How far the view is from the newest message. */
export const gapToBottom = (m: { content: number; view: number; offset: number }): number => m.content - m.view - m.offset;

export const isAtBottom = (gap: number): boolean => gap < BOTTOM_SLACK;

/**
 * The "scroll to latest" button shows only once the reader has really left the bottom (not while the content is still
 * growing under a view that is following it) and is more than half a screen, and at least 240px, away.
 */
export function isAway(gap: number, view: number, pinned: boolean): boolean {
  return !pinned && gap > Math.max(240, view * 0.5);
}

/**
 * Older rows were added above the view when the first row changed and the content grew. Returns the offset that keeps
 * the same message where it was, or null when nothing was prepended.
 */
export function offsetAfterPrepend(prev: { firstKey: string; content: number; offset: number }, next: { firstKey: string; content: number }): number | null {
  const grew = next.content - prev.content;
  if (!prev.firstKey || next.firstKey === prev.firstKey || grew <= 0) return null;
  return prev.offset + grew;
}

/**
 * A room whose loaded messages do not fill the window has nothing to scroll up to, so nothing would ever ask for
 * more: ask when the content is shorter than two windows, but only once per amount of history (the first measurements
 * are rough and must not keep asking).
 */
export function needsFill(content: number, view: number, have: number, askedFor: number): boolean {
  return content < view * 2 && askedFor !== have;
}
