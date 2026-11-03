import { expect, test } from "vitest";
import { autoSidebar, clampSidebar, floatingSidebar, isRail, SIDEBAR_RAIL, SIDEBAR_SNAP } from "./layout.js";

test("clampSidebar keeps min, max and half-window limits", () => {
  expect(clampSidebar(SIDEBAR_SNAP, 1280)).toBe(260);
  expect(clampSidebar(900, 1280)).toBe(520);
  expect(clampSidebar(400, 1280)).toBe(400);
  expect(clampSidebar(500, 800)).toBe(400); // at most half of an 800px window
  expect(clampSidebar(300, 500)).toBe(260);
});

test("below the snap width the list is the strip of pictures, with no width in between", () => {
  expect(clampSidebar(SIDEBAR_SNAP - 1, 1280)).toBe(SIDEBAR_RAIL);
  expect(clampSidebar(100, 1280)).toBe(SIDEBAR_RAIL);
  expect(clampSidebar(0, 1280)).toBe(SIDEBAR_RAIL);
  expect(clampSidebar(SIDEBAR_SNAP, 1280)).toBe(260); // and at it, a list at once
  for (let w = 0; w < 1000; w += 7) expect([SIDEBAR_RAIL, ...Array.from({ length: 261 }, (_, i) => 260 + i)]).toContain(clampSidebar(w, 1280));
  expect(isRail(SIDEBAR_RAIL)).toBe(true);
  expect(isRail(260)).toBe(false);
});

test("autoSidebar is 30% within limits", () => {
  expect(autoSidebar(1280)).toBe(384);
  expect(autoSidebar(800)).toBe(260);
  expect(autoSidebar(3000)).toBe(520);
});

test("the floating panel is roomier than the list, within limits", () => {
  expect(floatingSidebar(1280)).toBe(512);
  expect(floatingSidebar(800)).toBe(380);
  expect(floatingSidebar(3000)).toBe(560);
  for (const w of [760, 1000, 1280, 1920]) expect(floatingSidebar(w)).toBeGreaterThan(autoSidebar(w));
});
