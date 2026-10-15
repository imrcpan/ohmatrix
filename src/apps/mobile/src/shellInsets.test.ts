import { expect, test } from "vitest";
import { shellInsets, topInset } from "./shellInsets.js";

const bars = { top: 48, right: 0, bottom: 24, left: 0 };

test("without the keyboard the app keeps clear of the bars, on both platforms", () => {
  expect(shellInsets(bars, 0, "android")).toEqual({ ...bars, top: topInset(48) });
  expect(shellInsets(bars, 0, "ios")).toEqual({ ...bars, top: topInset(48) });
});

test("a tall status bar gives part of its empty band back; one no taller than its icons is kept whole", () => {
  expect(topInset(45)).toBeCloseTo(37.2, 1);
  expect(topInset(45)).toBeGreaterThan(32); // never into the icons
  expect(topInset(24)).toBe(24);
  expect(topInset(32)).toBe(32);
  expect(topInset(0)).toBe(0);
});

test("on Android the keyboard's height is added to the navigation bar, which it covers but does not count", () => {
  expect(shellInsets(bars, 300, "android")).toEqual({ top: topInset(48), right: 0, bottom: 324, left: 0 });
});

test("on iOS the keyboard's height is all of it, so the home indicator is not added again", () => {
  expect(shellInsets(bars, 336, "ios")).toEqual({ top: topInset(48), right: 0, bottom: 336, left: 0 });
});

test("the top and the sides do not change with the keyboard, and a negative height is none", () => {
  const r = shellInsets({ top: 10, right: 5, bottom: 0, left: 7 }, 200, "android");
  expect(r).toMatchObject({ top: 10, right: 5, left: 7 });
  expect(shellInsets(bars, -50, "android")).toEqual({ ...bars, top: topInset(48) });
});
