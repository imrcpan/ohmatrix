import { expect, test } from "vitest";
import { BOTTOM_SLACK, gapToBottom, isAtBottom, isAway, needsFill, offsetAfterPrepend } from "./scrollMath.js";

test("the gap is what is left below the view", () => {
  expect(gapToBottom({ content: 1000, view: 400, offset: 600 })).toBe(0);
  expect(gapToBottom({ content: 1000, view: 400, offset: 100 })).toBe(500);
});

test("close to the end counts as the bottom", () => {
  expect(isAtBottom(0)).toBe(true);
  expect(isAtBottom(BOTTOM_SLACK - 1)).toBe(true);
  expect(isAtBottom(BOTTOM_SLACK)).toBe(false);
});

test("the button needs the reader to have left the bottom and to be far enough away", () => {
  expect(isAway(2000, 700, true)).toBe(false); // still following: content is just growing
  expect(isAway(200, 700, false)).toBe(false); // less than 240px
  expect(isAway(300, 700, false)).toBe(false); // less than half a window
  expect(isAway(400, 700, false)).toBe(true);
  expect(isAway(300, 300, false)).toBe(true); // a small window: 240px is the floor
});

test("prepending older rows moves the offset by what was added", () => {
  expect(offsetAfterPrepend({ firstKey: "b", content: 1000, offset: 50 }, { firstKey: "a", content: 1400 })).toBe(450);
});

test("nothing prepended: same first row, no growth, or nothing known yet", () => {
  expect(offsetAfterPrepend({ firstKey: "b", content: 1000, offset: 50 }, { firstKey: "b", content: 1400 })).toBeNull(); // appended at the end
  expect(offsetAfterPrepend({ firstKey: "b", content: 1000, offset: 50 }, { firstKey: "a", content: 900 })).toBeNull();
  expect(offsetAfterPrepend({ firstKey: "", content: 0, offset: 0 }, { firstKey: "a", content: 900 })).toBeNull();
});

test("a short room asks for more history once per amount of it", () => {
  expect(needsFill(500, 700, 10, -1)).toBe(true);
  expect(needsFill(500, 700, 10, 10)).toBe(false); // already asked at this size
  expect(needsFill(500, 700, 25, 10)).toBe(true); // more arrived and it is still short
  expect(needsFill(1300, 700, 10, -1)).toBe(true); // a little over one window still has next to nothing to scroll
  expect(needsFill(1500, 700, 10, -1)).toBe(false);
  expect(needsFill(2000, 700, 10, -1)).toBe(false);
});
