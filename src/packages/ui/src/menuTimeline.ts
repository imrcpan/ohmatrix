/**
 * The timing of every menu opening and closing: the "bounce" button of the animation lab (animations-lab/menu-open), value for value.
 * The names of that page's CSS variables are in the comments. Times are in milliseconds. There is no React Native in this file, so
 * the numbers can be tested; `menuMotion.ts` plays them.
 */
export type Bezier = readonly [number, number, number, number];

/** CSS `ease`, `ease-in` and `ease-out`. (React Native's own `Easing.ease` is CSS's `ease-in`, so it is not used.) */
export const EASE: Bezier = [0.25, 0.1, 0.25, 1];
export const EASE_IN: Bezier = [0.42, 0, 1, 1];
export const EASE_OUT: Bezier = [0, 0, 0.58, 1];
/** `--ease`: it goes past its end and comes back, which is the bounce of the menu and of the rows. */
export const BOUNCE: Bezier = [0.34, 1.56, 0.64, 1];

/** `--sx` and `--sy`: the size the menu grows from, and shrinks to. */
export const FROM_SCALE = 0.5;
/** `--dy`: how far above its place a row starts. */
export const ROW_OFFSET = -8;

/** What one thing does: for how long, and how it eases. */
export interface Step {
  duration: number;
  easing: Bezier;
}

/** `--open: .35s`. The menu's opacity takes 40% of it, a row's 70%. */
export const OPENING = {
  opacity: { duration: 140, easing: EASE_OUT },
  scale: { duration: 350, easing: BOUNCE },
  rowOpacity: { duration: 245, easing: EASE },
  rowShift: { duration: 350, easing: BOUNCE },
} satisfies Record<string, Step>;

/** `--close: .15s` (`--close-ease: ease-in`). The menu's opacity takes 80% of it; a row goes in .1s, with no wait. */
export const CLOSING = {
  opacity: { duration: 120, easing: EASE },
  scale: { duration: 150, easing: EASE_IN },
  row: { duration: 100, easing: EASE },
} satisfies Record<string, Step>;

/** `--stagger: 30ms`, and the 60ms before the first row (`transition-delay: calc(60ms + var(--i) * var(--stagger))`). */
const FIRST_ROW = 60;
const STAGGER = 30;
/**
 * The page has four rows. A list of fourteen languages would take most of a second to be all there if every row waited for its turn,
 * so from this row on, the rows come together: the first nine are timed exactly as on the page.
 */
const LAST_STAGGERED = 8;
/** Rows past this one (below any screen) are not animated at all: they are there with the menu. */
export const MAX_ANIMATED_ROWS = 24;

/** How long row `i` waits before it starts to come in. */
export function rowDelay(i: number): number {
  return FIRST_ROW + Math.min(i, LAST_STAGGERED) * STAGGER;
}

/**
 * The point a menu grows from, as the `transformOrigin` string: where it was asked for (the pointer, or the edge of the button),
 * given as a place in the menu's own box of `width` by `height`. The `x` and `y` may lie outside the box (a menu cut to the
 * window has moved from where it was meant to open); the point then is the nearest one on the box. Whole pixels, because React
 * Native reads the string with a pattern that takes a number to be whole.
 */
export function originAt(x: number, y: number, width: number, height: number): string {
  const at = (v: number, size: number) => Math.round(Math.max(0, Math.min(v, size)));
  return `${at(x, width)}px ${at(y, height)}px`;
}
