import { expect, test } from "vitest";
import { EASE } from "./menuTimeline.js";
import { arcAt } from "./dialogTimeline.js";
import {
  EASE_IN_CLOSE,
  FADE_IN,
  HOVER,
  PANEL_CLOSING,
  PANEL_FROM,
  PANEL_OPENING,
  PIECE_CLOSING,
  PIECE_FROM,
  PIECE_OPENING,
  POP,
  pieceDelay,
  ringDistance,
} from "./emojiPanelTimeline.js";

// The numbers of the page of the animation lab (animations-lab/emoji-panel/index.html): --pop cubic-bezier(.3, 1.6, .5, 1), --open .5s,
// --close .16s, --ring 30ms, the panel from scale(.25), a piece from scale(0) rotate(-25deg), hover scale(1.3) rotate(-8deg).

test("the panel opens from a quarter of its size: its opacity in .15s, its size in .5s along --arc", () => {
  expect(PANEL_FROM).toBe(0.25);
  expect(PANEL_OPENING.opacity).toEqual({ duration: 150, easing: EASE });
  expect(PANEL_OPENING.scale).toEqual({ duration: 500, easing: arcAt });
});

test("the panel closes in .16s, the size with cubic-bezier(.4, 0, 1, 1)", () => {
  expect(PANEL_CLOSING.opacity).toEqual({ duration: 160, easing: EASE });
  expect(PANEL_CLOSING.scale).toEqual({ duration: 160, easing: EASE_IN_CLOSE });
  expect(EASE_IN_CLOSE).toEqual([0.4, 0, 1, 1]);
});

test("a piece comes up from no size, turned 25 degrees back, in .4s with --pop and .15s of opacity", () => {
  expect(PIECE_FROM).toEqual({ scale: 0, rotate: -25, opacity: 0 });
  expect(POP).toEqual([0.3, 1.6, 0.5, 1]);
  expect(PIECE_OPENING.pop).toEqual({ duration: 400, easing: POP });
  expect(PIECE_OPENING.opacity).toEqual({ duration: 150, easing: EASE });
});

test("a piece goes in .1s", () => {
  expect(PIECE_CLOSING.pop).toEqual({ duration: 100, easing: EASE });
  expect(PIECE_CLOSING.opacity).toEqual({ duration: 100, easing: EASE });
});

test("under the pointer a piece is 1.3 times its size and turned 8 degrees back: .25s in, .4s out, both with --pop", () => {
  expect(HOVER.scale).toBe(1.3);
  expect(HOVER.rotate).toBe(-8);
  expect(HOVER.in).toEqual({ duration: 250, easing: POP });
  expect(HOVER.out).toEqual({ duration: 400, easing: POP });
});

test("the pieces come up in rings: 60ms and 30ms for each cell from the middle", () => {
  // The page: 29 pieces in 6 columns (5 rows); the middle is column 2.5 and row 2.
  expect(ringDistance(14, 6, 5)).toBe(0.5); // column 2, row 2: half a cell from the middle
  expect(ringDistance(0, 6, 5)).toBe(Number(Math.hypot(2.5, 2).toFixed(2))); // the corner: 3.2
  expect(ringDistance(0, 6, 5)).toBe(3.2);
  expect(pieceDelay(0)).toBe(60);
  expect(pieceDelay(3.2)).toBeCloseTo(156, 9);
  // Pieces equally far from the middle wait the same.
  expect(ringDistance(14, 6, 5)).toBe(ringDistance(15, 6, 5));
  expect(ringDistance(0, 6, 5)).toBe(ringDistance(5, 6, 5));
});

test("the name of the group fades in as a piece's opacity does (.15s), after .1s", () => {
  expect(FADE_IN.delay).toBe(100);
  expect(FADE_IN.step).toEqual({ duration: 150, easing: EASE });
});
