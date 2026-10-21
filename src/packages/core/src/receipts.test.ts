import { expect, test } from "vitest";
import { spreadReceipts } from "./receipts.js";
import type { TimelineItem } from "./types.js";

const bob = { userId: "@bob:s", name: "Bob" };
const cy = { userId: "@cy:s", name: "Cy" };
const m = (id: string, over: Partial<TimelineItem> = {}): TimelineItem =>
  ({ id, sender: "@me:s", senderName: "Me", isOwn: true, ts: 1, status: "sent", content: { kind: "text", body: id }, ...over }) as TimelineItem;

test("a receipt on a later message marks my earlier messages as read", () => {
  const out = spreadReceipts([m("a"), m("b"), m("c", { readBy: [bob] })]);
  expect(out.map((x) => x.readBy?.map((r) => r.userId))).toEqual([["@bob:s"], ["@bob:s"], ["@bob:s"]]);
});

test("a receipt on the other person's message covers my messages before it, and not the ones after", () => {
  const out = spreadReceipts([m("a"), m("b", { isOwn: false, sender: "@bob:s", readBy: [bob] }), m("c")]);
  expect(out[0]!.readBy).toEqual([bob]);
  expect(out[2]!.readBy).toBeUndefined();
});

test("each message has the readers who are at or after it", () => {
  const out = spreadReceipts([m("a", { readBy: [cy] }), m("b", { readBy: [bob] }), m("c")]);
  expect(out[0]!.readBy?.map((r) => r.userId).sort()).toEqual(["@bob:s", "@cy:s"]);
  expect(out[1]!.readBy).toEqual([bob]);
  expect(out[2]!.readBy).toBeUndefined();
});

test("a message that is still being sent is never read, and a message that is right is not copied", () => {
  const a = m("a", { readBy: [bob] });
  const out = spreadReceipts([a, m("p", { status: "sending" }), m("z", { readBy: [bob] })]);
  expect(out[0]).toBe(a);
  expect(out[1]!.readBy).toBeUndefined();
});
