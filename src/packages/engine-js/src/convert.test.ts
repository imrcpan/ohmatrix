import { expect, test } from "vitest";
import { firstUrls, stripReplyFallback } from "./convert.js";

test("collects distinct links in order, trimming sentence punctuation", () => {
  expect(firstUrls("see https://a.example/x. and http://b.example/y?q=1!")).toEqual(["https://a.example/x", "http://b.example/y?q=1"]);
});

test("at most two links, no duplicates, ignores non-http", () => {
  expect(firstUrls("https://a.example 1 https://b.example 2 https://c.example")).toEqual(["https://a.example", "https://b.example"]);
  expect(firstUrls("https://a.example and https://a.example again")).toEqual(["https://a.example"]);
  expect(firstUrls("mailto:x@y.z or ftp://f.example")).toEqual([]);
});

test("reply fallback is removed without leaving blank lines before the reply", () => {
  expect(stripReplyFallback("> <@a:x> hi\n\nanswer")).toBe("answer");
  expect(stripReplyFallback("> hi\n> <@a:x> wrote:\n\n\n\nanswer")).toBe("answer");
  expect(stripReplyFallback("plain\n\ntext")).toBe("plain\n\ntext");
});
