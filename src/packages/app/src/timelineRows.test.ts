import { expect, test } from "vitest";
import type { TimelineItem } from "@ohmatrix/core";
import { buildRows } from "./timelineRows.js";

const m = (id: string, sender: string, ts: number, kind: "text" | "service" | "file" = "text"): TimelineItem => ({
  id,
  roomId: "!r",
  sender,
  senderName: sender,
  isOwn: false,
  ts,
  status: "sent",
  content:
    kind === "file"
      ? ({ kind, body: id, name: id, size: 1, mimeType: "text/plain", url: "mxc://s/f" } as TimelineItem["content"])
      : kind === "text"
        ? { kind, body: id }
        : { kind, body: id },
});
const T = new Date(2026, 5, 10, 12, 0).getTime();

test("groups consecutive messages from one sender and adds a date chip", () => {
  const rows = buildRows([m("1", "a", T), m("2", "a", T + 1000), m("3", "b", T + 2000)], T + 5000, "en");
  expect(rows.map((r) => r.type)).toEqual(["date", "message", "message", "message"]);
  const msgs = rows.filter((r) => r.type === "message") as Extract<(typeof rows)[number], { type: "message" }>[];
  expect(msgs.map((r) => [r.first, r.last])).toEqual([
    [true, false],
    [false, true],
    [true, true],
  ]);
  expect(rows[0]).toMatchObject({ label: "Today" });
});

test("service messages and day changes break groups", () => {
  const rows = buildRows([m("1", "a", T), m("s", "a", T + 1, "service"), m("2", "a", T + 2), m("3", "a", T + 86_400_000)], T + 2 * 86_400_000, "en");
  expect(rows.filter((r) => r.type === "date")).toHaveLength(2);
  const last = rows.filter((r) => r.type === "message").map((r) => (r as { first: boolean }).first);
  expect(last).toEqual([true, true, true]);
});

test("unread divider goes before the first unread and splits the sender run", () => {
  const rows = buildRows([m("1", "a", T), m("2", "a", T + 1000), m("3", "a", T + 2000)], T + 5000, "en", "2");
  expect(rows.map((r) => r.type)).toEqual(["date", "message", "unread", "message", "message"]);
  const msgs = rows.filter((r) => r.type === "message") as { first: boolean; last: boolean }[];
  expect(msgs.map((r) => [r.first, r.last])).toEqual([
    [true, true],
    [true, false],
    [false, true],
  ]);
});

test("a file is a run of its own: it neither joins the messages around it nor lets them join it", () => {
  const rows = buildRows([m("1", "a", T), m("f", "a", T + 1000, "file"), m("2", "a", T + 2000), m("3", "a", T + 3000)], T + 5000, "en");
  const msgs = rows.filter((r) => r.type === "message") as Extract<(typeof rows)[number], { type: "message" }>[];
  expect(msgs.map((r) => [r.first, r.last])).toEqual([
    [true, true],
    [true, true],
    [true, false],
    [false, true],
  ]);
});

test("a message directly under someone else's bubble is marked, so its gap can be tripled", () => {
  const rows = buildRows(
    [m("1", "a", T), m("f", "a", T + 1000, "file"), m("2", "b", T + 2000), m("s", "b", T + 3000, "service"), m("3", "a", T + 4000)],
    T + 5000,
    "en",
  );
  const msgs = rows.filter((r) => r.type === "message") as Extract<(typeof rows)[number], { type: "message" }>[];
  // the first has nothing above it; the file is the same person's; "2" follows another sender; "3" follows a service chip
  expect(msgs.map((r) => r.newSender)).toEqual([false, false, true, false]);
});

test("only text bubbles stick to each other by the corners, quoted or not", () => {
  const withReply = (t: TimelineItem): TimelineItem => ({ ...t, replyTo: { id: "$x", senderName: "b", sender: "b", preview: "hi" } });
  const msgs = (items: TimelineItem[]) =>
    buildRows(items, T + 9000, "en").filter((r) => r.type === "message") as { stickAbove: boolean; stickBelow: boolean }[];
  // Three plain texts in a row: the middle one sticks both ways, the ends only inwards.
  const a = msgs([m("1", "a", T), m("2", "a", T + 1000), m("3", "a", T + 2000)]);
  expect(a.map((r) => [r.stickAbove, r.stickBelow])).toEqual([
    [false, true],
    [true, true],
    [true, false],
  ]);
  // A quote does not change that: a quoted bubble sticks like any other text.
  const b = msgs([m("1", "a", T), withReply(m("2", "a", T + 1000)), m("3", "a", T + 2000)]);
  expect(b.map((r) => [r.stickAbove, r.stickBelow])).toEqual([
    [false, true],
    [true, true],
    [true, false],
  ]);
  // A file in the middle sticks to nothing and nothing sticks to it.
  const d = msgs([m("1", "a", T), m("f", "a", T + 1000, "file"), m("3", "a", T + 2000)]);
  expect(d.map((r) => [r.stickAbove, r.stickBelow])).toEqual([
    [false, false],
    [false, false],
    [false, false],
  ]);
  // Different senders do not stick either.
  const c = msgs([m("1", "a", T), m("2", "b", T + 1000)]);
  expect(c.map((r) => [r.stickAbove, r.stickBelow])).toEqual([
    [false, false],
    [false, false],
  ]);
});
