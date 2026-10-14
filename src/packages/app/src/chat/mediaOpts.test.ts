import { expect, test } from "vitest";
import { decryptOpts } from "./mediaOpts.js";

test("plain or missing media needs no options", () => {
  expect(decryptOpts(undefined)).toEqual({});
  expect(decryptOpts({ url: "mxc://a/b" })).toEqual({});
  expect(decryptOpts({ encryption: null, mimeType: "image/png" })).toEqual({});
});

test("encrypted media brings its keys, and its type when it has one", () => {
  const keys = { k: "x" };
  expect(decryptOpts({ encryption: keys, mimeType: "image/png" })).toEqual({ encryption: keys, mimeType: "image/png" });
  expect(decryptOpts({ encryption: keys })).toEqual({ encryption: keys });
});
