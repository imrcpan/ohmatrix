import { expect, test } from "vitest";
import type { TimelineItem } from "./types.js";
import { diffTimeline } from "./listDiff.js";

const it = (id: string, body = id, status: TimelineItem["status"] = "sent", txn?: string): TimelineItem => ({
  id,
  roomId: "!r",
  sender: "@a:s",
  senderName: "a",
  isOwn: false,
  ts: 1,
  status,
  content: { kind: "text", body },
  ...(txn && { transactionId: txn }),
});

test("append → insert", () => {
  expect(diffTimeline([it("1")], [it("1"), it("2")])).toEqual([{ op: "insert", index: 1, item: it("2") }]);
});
test("local echo ack keeps identity via transaction id → set", () => {
  const u = diffTimeline([it("~x", "hi", "sending", "t1")], [it("$e", "hi", "sent", "t1")]);
  expect(u).toEqual([{ op: "set", index: 0, item: it("$e", "hi", "sent", "t1") }]);
});
test("prepend → reset", () => {
  expect(diffTimeline([it("2")], [it("1"), it("2")])[0]?.op).toBe("reset");
});
test("no change → nothing", () => {
  expect(diffTimeline([it("1")], [it("1")])).toEqual([]);
});
test("pinning a message updates it in place", () => {
  const pinned = { ...it("1"), pinned: true };
  expect(diffTimeline([it("1")], [pinned])).toEqual([{ op: "set", index: 0, item: pinned }]);
  expect(diffTimeline([pinned], [it("1")])).toEqual([{ op: "set", index: 0, item: it("1") }]);
});

import { reuseRooms } from "./listDiff.js";
import type { RoomSummary } from "./types.js";

const room = (id: string, over: Partial<RoomSummary> = {}): RoomSummary => ({
  id,
  name: id,
  isDirect: false,
  memberCount: 2,
  unreadCount: 0,
  highlightCount: 0,
  lastActivityTs: 1,
  ...over,
});

test("a room that did not change keeps its object, one that did gets a new one", () => {
  const prev = [room("a"), room("b"), room("c")];
  const next = [room("a"), room("b", { unreadCount: 3 }), room("c")];
  const out = reuseRooms(prev, next);
  expect(out[0]).toBe(prev[0]);
  expect(out[1]).toBe(next[1]);
  expect(out[1]).not.toBe(prev[1]);
  expect(out[2]).toBe(prev[2]);
});

test("a changed last message, a new typist or a moved room is a change; order follows the new list", () => {
  const msg = (body: string) => ({
    id: "$1",
    roomId: "a",
    sender: "@x:y",
    senderName: "x",
    isOwn: false,
    ts: 5,
    status: "sent" as const,
    content: { kind: "text" as const, body },
  });
  const prev = [room("a", { lastMessage: msg("hi") }), room("b")];
  expect(reuseRooms(prev, [room("a", { lastMessage: msg("hi") }), room("b")])[0]).toBe(prev[0]);
  expect(reuseRooms(prev, [room("a", { lastMessage: msg("edited") }), room("b")])[0]).not.toBe(prev[0]);
  expect(reuseRooms(prev, [room("a", { lastMessage: msg("hi"), typing: ["ann"] }), room("b")])[0]).not.toBe(prev[0]);
  const swapped = reuseRooms(prev, [room("b"), room("a", { lastMessage: msg("hi") })]);
  expect(swapped.map((r) => r.id)).toEqual(["b", "a"]);
  expect(swapped[0]).toBe(prev[1]);
  expect(swapped[1]).toBe(prev[0]);
});

test("the first list, and rooms that are new, come through as they are", () => {
  const next = [room("a")];
  expect(reuseRooms([], next)[0]).toBe(next[0]);
  expect(reuseRooms([room("z")], next)[0]).toBe(next[0]);
});
