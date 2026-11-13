import { expect, test } from "vitest";
import { ARC, CLOSING, CLOSING_SIZE, FROM_SCALE, OPENING, arcAt } from "./dialogTimeline.js";
import { EASE_OUT } from "./menuTimeline.js";

// The numbers of the page of the animation lab (animations-lab/dialog/index.html): --open .2s, --close .1s, --ease-close
// cubic-bezier(.4, 0, .2, 1) (which the page's own closing does not use, see dialogTimeline.ts), scale(.6), the dim layer and the card's opacity ease-out, and `animation: dialog-in .3s var(--arc)`.

test("a dialog grows in .3s from .6 of its size; its opacity takes 40% of the .2s of --open, the dim layer all of it", () => {
  expect(FROM_SCALE).toBe(0.6);
  expect(OPENING.scale.duration).toBe(300);
  expect(OPENING.scale.easing).toBe(arcAt);
  expect(OPENING.opacity).toEqual({ duration: 80, easing: EASE_OUT });
  expect(OPENING.backdrop).toEqual({ duration: 200, easing: EASE_OUT });
});

test("a dialog closes in .1s: the opacity and the dim layer ease-out, and the card is at .6 of its size from the first frame", () => {
  expect(CLOSING.opacity).toEqual({ duration: 100, easing: EASE_OUT });
  expect(CLOSING.backdrop).toEqual({ duration: 100, easing: EASE_OUT });
  // The page's transform transition (--ease-close) does not run in Chromium: nothing about the size is timed.
  expect(CLOSING).not.toHaveProperty("scale");
  expect(CLOSING_SIZE).toBe(0.6);
});

test("--arc has its 21 points, and linear() draws straight lines between them at equal distances", () => {
  expect(ARC).toHaveLength(21);
  expect(arcAt(0)).toBe(0);
  expect(arcAt(1)).toBe(1);
  expect(arcAt(1 / 20)).toBeCloseTo(0.503, 9);
  expect(arcAt(4 / 20)).toBeCloseTo(1.15, 9);
  // Half way between the points .503 and .863.
  expect(arcAt(1.5 / 20)).toBeCloseTo((0.503 + 0.863) / 2, 9);
  // Outside the range it holds its ends.
  expect(arcAt(-0.2)).toBe(0);
  expect(arcAt(1.2)).toBe(1);
});

test("the top of the arc is at 0.2 of the time, 15% past the end, which is a card of 1.06 of its size", () => {
  const top = Math.max(...ARC);
  expect(top).toBe(1.15);
  expect(ARC.indexOf(top)).toBe(4);
  expect(FROM_SCALE + (1 - FROM_SCALE) * top).toBeCloseTo(1.06, 9);
  // After the top it comes back down without going up again.
  for (let i = 5; i < ARC.length; i++) expect(ARC[i]!).toBeLessThanOrEqual(ARC[i - 1]!);
});
