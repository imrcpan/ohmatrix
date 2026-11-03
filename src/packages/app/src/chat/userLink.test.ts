import { expect, test } from "vitest";
import { userOfLink } from "./userLink.js";

test("a matrix.to link to a person gives the person", () => {
  expect(userOfLink("https://matrix.to/#/@sljob:matrix.org")).toBe("@sljob:matrix.org");
  expect(userOfLink("https://matrix.to/#/@sljob:matrix.org?via=matrix.org")).toBe("@sljob:matrix.org");
  expect(userOfLink("https://matrix.to/#/%40sljob%3Amatrix.org")).toBe("@sljob:matrix.org");
  expect(userOfLink("http://matrix.to/#/@a:b.c")).toBe("@a:b.c");
});

test("other links are not about a person", () => {
  expect(userOfLink("https://matrix.to/#/!room:matrix.org/$event")).toBeUndefined(); // a message
  expect(userOfLink("https://matrix.to/#/#room:matrix.org")).toBeUndefined(); // a room alias
  expect(userOfLink("https://example.org/#/@a:b.c")).toBeUndefined();
  expect(userOfLink("https://matrix.to/#/@nodomain")).toBeUndefined();
});
