import { expect, test } from "vitest";
import { GESTURE_BAR_MAX, shellInsets, topInset } from "./shellInsets.js";

const bars = { top: 48, right: 0, bottom: 24, left: 0 };

test("without the keyboard the app keeps clear of the bars, on both platforms", () => {
  for (const os of ["android", "ios"] as const)
    expect(shellInsets({ ...bars, bottom: 48 }, 0, os)).toMatchObject({ ...bars, bottom: 48, top: topInset(48), navBottom: 0, keyboard: 0 });
});

test("a gesture bar is drawn under, not left clear: the screens reach the bottom edge and leave room for it themselves", () => {
  // The room is still reported (a full-window layer such as a picture viewer needs it), and navBottom says how much of it is floating.
  expect(shellInsets(bars, 0, "android")).toMatchObject({ ...bars, top: topInset(48), navBottom: 24 });
  expect(shellInsets({ ...bars, bottom: GESTURE_BAR_MAX }, 0, "android").navBottom).toBe(GESTURE_BAR_MAX);
  // Three buttons (48 dp) would cover what is under them: left clear, as before.
  expect(shellInsets({ ...bars, bottom: GESTURE_BAR_MAX + 1 }, 0, "android").navBottom).toBe(0);
  expect(shellInsets({ ...bars, bottom: 0 }, 0, "android").navBottom).toBe(0);
});

test("with the keyboard up nothing floats: the app stops above the keyboard, which covers the gesture bar", () => {
  expect(shellInsets(bars, 300, "android").navBottom).toBe(0);
  expect(shellInsets(bars, 336, "ios").navBottom).toBe(0);
});

test("a tall status bar gives part of its empty band back; one no taller than its icons is kept whole", () => {
  expect(topInset(45)).toBeCloseTo(37.2, 1);
  expect(topInset(45)).toBeGreaterThan(32); // never into the icons
  expect(topInset(24)).toBe(24);
  expect(topInset(32)).toBe(32);
  expect(topInset(0)).toBe(0);
});

test("on Android the keyboard's height is added to the navigation bar, which it covers but does not count", () => {
  expect(shellInsets(bars, 300, "android")).toMatchObject({
    top: topInset(48),
    right: 0,
    bottom: 324,
    left: 0,
    navBottom: 0,
    keyboard: 324,
    resting: { bottom: 24, navBottom: 24 },
  });
});

test("on iOS the keyboard's height is all of it, so the home indicator is not added again", () => {
  expect(shellInsets(bars, 336, "ios")).toMatchObject({
    top: topInset(48),
    right: 0,
    bottom: 336,
    left: 0,
    navBottom: 0,
    keyboard: 336,
    resting: { bottom: 24, navBottom: 24 },
  });
});

test("the top and the sides do not change with the keyboard, and a negative height is none", () => {
  const r = shellInsets({ top: 10, right: 5, bottom: 0, left: 7 }, 200, "android");
  expect(r).toMatchObject({ top: 10, right: 5, left: 7 });
  expect(shellInsets(bars, -50, "android")).toMatchObject({ ...bars, top: topInset(48), navBottom: 24 });
});
