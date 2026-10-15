import { expect, test } from "vitest";
import { toBase64 } from "./base64.js";

test("base64 matches Node's, for every length remainder", () => {
  for (const text of ["", "f", "fo", "foo", "foob", "fooba", "foobar", "ÿ\u0000\u007f"]) {
    const bytes = new TextEncoder().encode(text);
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  }
  expect(toBase64(new Uint8Array([1, 2, 3, 4]).buffer)).toBe("AQIDBA==");
});
