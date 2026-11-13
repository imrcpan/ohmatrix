import { ARC, arcAt, type Curve, type DialogStep } from "./dialogTimeline.js";
import { EASE, type Bezier } from "./menuTimeline.js";

/**
 * The timing of the panel of emoji (and of stickers) opening and closing, of the pieces in it coming up, and of the one the pointer is
 * on: the page of the animation lab (animations-lab/emoji-panel), value for value. The names of that page's CSS variables are in the
 * comments. Times are in milliseconds. There is no React Native in this file, so the numbers can be tested; `panelMotion.tsx` plays them.
 */
export { ARC, arcAt, type Curve, type DialogStep };

/** `--pop`: a quick bounce for small things. */
export const POP: Bezier = [0.3, 1.6, 0.5, 1];
/** `transition: ... cubic-bezier(.4, 0, 1, 1)` of the panel's closing. */
export const EASE_IN_CLOSE: Bezier = [0.4, 0, 1, 1];

/** The size the panel grows from, and shrinks to (`transform: scale(.25)`). */
export const PANEL_FROM = 0.25;

/** The panel opens: its opacity in .15s, its size in `--open: .5s` along `--arc` (which goes past full size and comes back). */
export const PANEL_OPENING = {
  opacity: { duration: 150, easing: EASE },
  scale: { duration: 500, easing: arcAt },
} satisfies Record<string, DialogStep>;

/** The panel closes in `--close: .16s`. */
export const PANEL_CLOSING = {
  opacity: { duration: 160, easing: EASE },
  scale: { duration: 160, easing: EASE_IN_CLOSE },
} satisfies Record<string, DialogStep>;

/** A piece (an emoji, a sticker) starts at no size, turned 25 degrees back, and not seen. */
export const PIECE_FROM = { scale: 0, rotate: -25, opacity: 0 };

/** A piece comes up: its opacity in .15s, its size and turn in .4s with `--pop`. */
export const PIECE_OPENING = {
  opacity: { duration: 150, easing: EASE },
  pop: { duration: 400, easing: POP },
} satisfies Record<string, DialogStep>;

/** What comes with the panel without a motion of its own (the name of the group) fades in as a piece does, after .1s. */
export const FADE_IN = { delay: 100, step: PIECE_OPENING.opacity };

/** A piece goes in .1s (the page gives it no wait). */
export const PIECE_CLOSING = {
  opacity: { duration: 100, easing: EASE },
  pop: { duration: 100, easing: EASE },
} satisfies Record<string, DialogStep>;

/**
 * The piece under the pointer is 1.3 times its size and turned 8 degrees back. It gets there in .25s with `--pop`, at once; it goes
 * back in .4s with `--pop`, after the same wait it had to come up (the page's rule for the piece without the pointer on it is the one
 * that times its way back).
 */
export const HOVER = {
  scale: 1.3,
  rotate: -8,
  in: { duration: 250, easing: POP },
  out: { duration: 400, easing: POP },
} satisfies { scale: number; rotate: number; in: DialogStep; out: DialogStep };

/** `--ring: 30ms`: the wait for each step of distance from the middle, and the 60ms before the first (`.06s + var(--d) * var(--ring)`). */
const FIRST = 60;
const RING = 30;

/**
 * `--d`: how far piece `index` of a grid of `cols` columns is from the middle of the `rows` rows that are seen, in cells, to two
 * decimals as the page makes it. Pieces come up in rings, from the middle out.
 */
export function ringDistance(index: number, cols: number, rows: number): number {
  const dx = (index % cols) - (cols - 1) / 2;
  const dy = Math.floor(index / cols) - (rows - 1) / 2;
  return Number(Math.hypot(dx, dy).toFixed(2));
}

/** How long a piece at distance `d` waits before it comes up. */
export function pieceDelay(d: number): number {
  return FIRST + d * RING;
}

/** With "reduce motion" on, the page gives everything .01s and no wait. */
export const REDUCED_MS = 10;
