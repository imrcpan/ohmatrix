import { EASE_OUT, type Bezier } from "./menuTimeline.js";

/**
 * The timing of every dialog opening and closing: the page of the animation lab (animations-lab/dialog), value for value. The names of
 * that page's CSS variables are in the comments. Times are in milliseconds. There is no React Native in this file, so the numbers
 * can be tested; `dialogMotion.ts` plays them.
 */

/** What a motion eases with: a cubic bezier (CSS `cubic-bezier`), or a function of the progress from 0 to 1 (CSS `linear()`). */
export type Curve = Bezier | ((t: number) => number);
export interface DialogStep {
  duration: number;
  easing: Curve;
}

/** `--arc`: the progress of the opening, which goes past 1 and comes back. CSS `linear()` puts these 21 points at equal distances. */
export const ARC: readonly number[] = [
  0, 0.503, 0.863, 1.078, 1.15, 1.148, 1.144, 1.136, 1.127, 1.115, 1.103, 1.089, 1.075, 1.061, 1.047, 1.035, 1.023, 1.014, 1.006, 1.002, 1,
];

/** `linear()` of `ARC`: straight lines between the points. */
export function arcAt(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const x = t * (ARC.length - 1);
  const i = Math.floor(x);
  return ARC[i]! + (ARC[i + 1]! - ARC[i]!) * (x - i);
}

/** The size the dialog grows from, and shrinks to (`transform: scale(.6)`). */
export const FROM_SCALE = 0.6;

/**
 * `--open: .2s`: the dim layer fades in over all of it, the card's opacity over 40% of it (ease-out), and its size follows `--arc`
 * for .3s (`animation: dialog-in .3s var(--arc)`), from the centre.
 */
export const OPENING = {
  backdrop: { duration: 200, easing: EASE_OUT },
  opacity: { duration: 80, easing: EASE_OUT },
  scale: { duration: 300, easing: arcAt },
} satisfies Record<string, DialogStep>;

/**
 * `--close: .1s`: the dim layer and the card's opacity go in .1s, ease-out.
 *
 * The size does not: the page says `transform .1s var(--ease-close)`, but in Chromium (measured, frame by frame, in the one of
 * Playwright) that transition never starts, because the size is held at 1 by the end of the opening animation and a transition does
 * not start from an animation's value. The card is at `CLOSING_SIZE` from the first frame of the closing, and fades out there. This
 * does what the page shows.
 */
export const CLOSING = {
  backdrop: { duration: 100, easing: EASE_OUT },
  opacity: { duration: 100, easing: EASE_OUT },
} satisfies Record<string, DialogStep>;
export const CLOSING_SIZE = FROM_SCALE;
