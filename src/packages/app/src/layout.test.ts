import { expect, test } from "vitest";
import { autoSidebar, clampSidebar } from "./layout.js";

test("clampSidebar keeps min, max and half-window limits", () => {
  expect(clampSidebar(100, 1280)).toBe(260);
  expect(clampSidebar(900, 1280)).toBe(520);
  expect(clampSidebar(400, 1280)).toBe(400);
  expect(clampSidebar(500, 800)).toBe(400); // at most half of an 800px window
  expect(clampSidebar(300, 500)).toBe(260);
});

test("autoSidebar is 30% within limits", () => {
  expect(autoSidebar(1280)).toBe(384);
  expect(autoSidebar(800)).toBe(260);
  expect(autoSidebar(3000)).toBe(520);
});
