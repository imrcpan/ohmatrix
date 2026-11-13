import { expect, test } from "vitest";
import { BOUNCE, CLOSING, EASE, EASE_IN, EASE_OUT, FROM_SCALE, OPENING, ROW_OFFSET, originAt, rowDelay } from "./menuTimeline.js";

// The numbers of the "bounce" menu of the animation lab (animations-lab/menu-open/index.html): --open .35s, --close .15s,
// --close-ease ease-in, --stagger 30ms, --sx and --sy .5, --dy -8px, --ease cubic-bezier(.34, 1.56, .64, 1).

test("a menu opens in .35s with the bounce, and its opacity in 40% of that, ease-out", () => {
  expect(OPENING.scale).toEqual({ duration: 350, easing: BOUNCE });
  expect(BOUNCE).toEqual([0.34, 1.56, 0.64, 1]);
  expect(OPENING.opacity).toEqual({ duration: 0.35 * 1000 * 0.4, easing: EASE_OUT });
  expect(EASE_OUT).toEqual([0, 0, 0.58, 1]);
});

test("a row comes in over the .35s of the bounce, its opacity in 70% of that (ease)", () => {
  expect(OPENING.rowShift).toEqual({ duration: 350, easing: BOUNCE });
  expect(OPENING.rowOpacity.duration).toBeCloseTo(245, 9);
  expect(OPENING.rowOpacity.easing).toEqual(EASE);
  expect(EASE).toEqual([0.25, 0.1, 0.25, 1]);
});

test("a menu closes in .15s ease-in, its opacity in 80% of that (ease), and a row in .1s", () => {
  expect(CLOSING.scale).toEqual({ duration: 150, easing: EASE_IN });
  expect(EASE_IN).toEqual([0.42, 0, 1, 1]);
  expect(CLOSING.opacity.duration).toBeCloseTo(120, 9);
  expect(CLOSING.opacity.easing).toEqual(EASE);
  expect(CLOSING.row).toEqual({ duration: 100, easing: EASE });
});

test("a menu grows from half its size, and a row comes down from 8px above its place", () => {
  expect(FROM_SCALE).toBe(0.5);
  expect(ROW_OFFSET).toBe(-8);
});

test("a row waits 60ms plus 30ms for each row before it", () => {
  expect([0, 1, 2, 3].map(rowDelay)).toEqual([60, 90, 120, 150]);
});

test("a long list does not wait longer for its last rows than for the ninth", () => {
  expect(rowDelay(8)).toBe(300);
  expect(rowDelay(9)).toBe(300);
  expect(rowDelay(40)).toBe(300);
});

test("the origin is the point the menu was asked for, in the box of the menu, and never outside it", () => {
  expect(originAt(0, 0, 220, 144)).toBe("0px 0px");
  expect(originAt(220, 0, 220, 144)).toBe("220px 0px");
  expect(originAt(30, 144, 220, 144)).toBe("30px 144px");
  // A menu moved to keep it in the window: the point asked for lies outside it, and the nearest of its own is taken.
  expect(originAt(-40, -6, 220, 144)).toBe("0px 0px");
  expect(originAt(500, 300, 220, 144)).toBe("220px 144px");
  // Whole pixels.
  expect(originAt(12.6, 7.4, 220, 144)).toBe("13px 7px");
});
