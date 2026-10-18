import { expect, test } from "vitest";
import { secondsLeft, ZOOM_CONFIRM_SECONDS } from "./useZoomChange.js";

test("the countdown counts a started second as left, and stops at zero", () => {
  const until = 1_000_000 + ZOOM_CONFIRM_SECONDS * 1000;
  expect(secondsLeft(until, 1_000_000)).toBe(15);
  expect(secondsLeft(until, 1_000_001)).toBe(15);
  expect(secondsLeft(until, 1_000_000 + 14_001)).toBe(1);
  expect(secondsLeft(until, until)).toBe(0);
  expect(secondsLeft(until, until + 5000)).toBe(0);
});
