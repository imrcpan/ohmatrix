import { expect, test } from "vitest";
import { hexOf, toBase64 } from "./base64.js";

test("base64 matches Node's, for every length remainder", () => {
  for (const text of ["", "f", "fo", "foo", "foob", "fooba", "foobar", "ÿ\u0000\u007f"]) {
    const bytes = new TextEncoder().encode(text);
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  }
  expect(toBase64(new Uint8Array([1, 2, 3, 4]).buffer)).toBe("AQIDBA==");
});

test("hex is two lower-case digits for each byte", () => {
  expect(hexOf(new Uint8Array([0, 1, 15, 16, 255]))).toBe("00010f10ff");
  expect(hexOf(new Uint8Array([171, 205]).buffer)).toBe("abcd");
  expect(hexOf(new Uint8Array(0))).toBe("");
});
