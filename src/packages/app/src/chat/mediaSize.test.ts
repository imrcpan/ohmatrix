import { expect, test } from "vitest";
import { fit, MAX_IMAGE } from "./mediaSize.js";

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
