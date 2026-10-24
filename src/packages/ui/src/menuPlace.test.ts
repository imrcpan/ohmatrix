import { expect, test } from "vitest";
import { placeMenu } from "./menuPlace.js";

const base = { gap: 6, minTop: 48, bottomLimit: 760 };

test("a menu that fits goes where it was asked to: below the anchor, or above it with `up`", () => {
  expect(placeMenu({ ...base, y: 100, height: 40, contentHeight: 200, up: false })).toEqual({ top: 146, height: 200, scrolls: false });
  expect(placeMenu({ ...base, y: 600, height: 40, contentHeight: 200, up: true })).toEqual({ top: 394, height: 200, scrolls: false });
});

test("a menu that does not fit on its side goes to the other, if all of it fits there", () => {
  // Asked to open below an anchor near the bottom: it goes above.
  expect(placeMenu({ ...base, y: 600, height: 40, contentHeight: 300, up: false })).toEqual({ top: 294, height: 300, scrolls: false });
  // Asked to open above an anchor near the top: it goes below.
  expect(placeMenu({ ...base, y: 80, height: 40, contentHeight: 300, up: true })).toEqual({ top: 126, height: 300, scrolls: false });
});

test("a menu taller than either side is cut to the roomier one, below the status bar, and scrolls", () => {
  // A 14-row list (504) at the bottom of a screen shown at 150% zoom (about 530 tall): the room above is 470.
  const m = placeMenu({ y: 480, height: 36, contentHeight: 504, up: true, minTop: 48, bottomLimit: 520, gap: 6 });
  expect(m.scrolls).toBe(true);
  expect(m.top).toBeGreaterThanOrEqual(48);
  expect(m.top + m.height).toBeLessThanOrEqual(480 - 6 + 0.001);
  expect(m.height).toBe(480 - 6 - 48);
});

test("it never goes under the status bar or past the gesture bar", () => {
  for (const up of [true, false])
    for (const y of [0, 30, 200, 500, 700, 790])
      for (const contentHeight of [60, 250, 504, 900]) {
        const m = placeMenu({ ...base, y, height: 36, contentHeight, up });
        expect(m.top, `${up} ${y} ${contentHeight}`).toBeGreaterThanOrEqual(base.minTop);
        expect(m.top + m.height, `${up} ${y} ${contentHeight}`).toBeLessThanOrEqual(Math.max(base.bottomLimit, base.minTop + m.height));
        expect(m.height).toBeLessThanOrEqual(contentHeight);
      }
});
