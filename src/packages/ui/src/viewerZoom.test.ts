import { expect, test } from "vitest";
import { pinchedScale } from "./viewerMath.js";

test("a pinch scales by how far the fingers moved apart, within the limits", () => {
  expect(pinchedScale(1, 100, 200)).toBe(2);
  expect(pinchedScale(2, 200, 100)).toBe(1);
  expect(pinchedScale(1, 100, 100)).toBe(1);
  expect(pinchedScale(4, 100, 1000)).toBe(8);
  expect(pinchedScale(1, 100, 1)).toBe(0.25);
  expect(pinchedScale(3, 0, 50)).toBe(3);
});
