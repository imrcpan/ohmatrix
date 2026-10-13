import { expect, test } from "vitest";
import type { TimelineItem } from "@ohmatrix/core";
import { diffTimeline } from "./diff.js";

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
