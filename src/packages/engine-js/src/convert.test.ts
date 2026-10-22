import { expect, test } from "vitest";
import { firstUrls, pinnedIds, stripReplyFallback } from "./convert.js";

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

test("pinned messages are read from the spec's `pinned` list, and from the `events` list this app used to write", () => {
  const room = (content: unknown) =>
    ({ currentState: { getStateEvents: () => ({ getContent: () => content }) } }) as unknown as Parameters<typeof pinnedIds>[0];
  expect(pinnedIds(room({ pinned: ["$a", "$b"] }))).toEqual(["$a", "$b"]);
  expect(pinnedIds(room({ events: ["$old"] }))).toEqual(["$old"]);
  expect(pinnedIds(room({ pinned: ["$a"], events: ["$old"] }))).toEqual(["$a"]);
  expect(pinnedIds(room({}))).toEqual([]);
  expect(pinnedIds(null)).toEqual([]);
});
