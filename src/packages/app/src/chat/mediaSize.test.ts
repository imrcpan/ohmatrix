import { expect, test } from "vitest";
import { fit, fitSticker, MAX_IMAGE } from "./mediaSize.js";

test("an unknown size is a square of the maximum", () => {
  expect(fit()).toEqual({ width: MAX_IMAGE, height: MAX_IMAGE });
  expect(fit(0, 100)).toEqual({ width: MAX_IMAGE, height: MAX_IMAGE });
});

test("large pictures are scaled down on the long edge, keeping the aspect", () => {
  expect(fit(1200, 600)).toEqual({ width: 300, height: 150 });
  expect(fit(600, 1200)).toEqual({ width: 150, height: 300 });
});

test("small pictures are not blown up, but are not tiny either", () => {
  expect(fit(200, 200)).toEqual({ width: 200, height: 200 });
  expect(fit(40, 40)).toEqual({ width: 130, height: 90 });
});

test("a sticker is drawn to one long edge, a small one enlarged and a big one shrunk", () => {
  expect(fitSticker(128, 64)).toEqual({ width: 170, height: 85 });
  expect(fitSticker(1000, 500)).toEqual({ width: 170, height: 85 });
  expect(fitSticker()).toEqual({ width: 170, height: 170 });
  expect(fitSticker(1000, 10).height).toBe(40);
});
