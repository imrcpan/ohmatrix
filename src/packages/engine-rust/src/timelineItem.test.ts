import { expect, test } from "vitest";
import { statusOf, toTimelineItem, type EventItemLike } from "./timelineItem.js";

const ev = (over: Partial<EventItemLike> = {}): EventItemLike => ({
  eventId: "$e1",
  sender: "@alice:s",
  senderName: "Alice",
  isOwn: false,
  timestamp: 1000,
  sendState: "Sent",
  content: { type: "text", body: "hello" },
  ...over,
});
const to = (e: EventItemLike) => toTimelineItem(e, "!r:s", "@me:s");

test("a text message: its sender, time, text and status", () => {
  expect(to(ev())).toEqual({
    id: "$e1",
    roomId: "!r:s",
    sender: "@alice:s",
    senderName: "Alice",
    isOwn: false,
    ts: 1000,
    status: "sent",
    content: { kind: "text", body: "hello" },
  });
});

test("the send state is the status: waiting, failed, sent, and nothing local is sent", () => {
  expect(statusOf("NotSentYet")).toBe("sending");
  expect(statusOf("SendingFailed")).toBe("failed");
  expect(statusOf("Sent")).toBe("sent");
  expect(statusOf(undefined)).toBe("sent");
});

test("a local echo has its transaction id and, until the server answers, no event id", () => {
  const item = to(ev({ eventId: undefined, transactionId: "txn1", sendState: "NotSentYet", isOwn: true }))!;
  expect(item).toMatchObject({ id: "txn1", transactionId: "txn1", status: "sending", isOwn: true });
});

test("the sender is named by the profile, or else by their id", () => {
  expect(to(ev({ senderName: undefined }))!.senderName).toBe("alice");
});

test("service lines: someone joined, the room was renamed; the ones with no words are left out", () => {
  expect(to(ev({ content: { type: "membership", userId: "@bob:s", change: "Joined" } }))!.content).toEqual({ kind: "service", body: "bob joined" });
  expect(to(ev({ content: { type: "membership", userId: "@bob:s", userName: "Bob", change: "Invited" } }))!.content).toEqual({
    kind: "service",
    body: "Alice invited Bob",
  });
  expect(to(ev({ content: { type: "state", state: { kind: "RoomName", value: "Team" } } }))!.content).toEqual({
    kind: "service",
    body: "Alice changed the room name to “Team”",
  });
  expect(to(ev({ content: { type: "state", state: { kind: "RoomPowerLevels" } } }))).toBeNull();
  expect(to(ev({ content: { type: "membership", userId: "@bob:s", change: "Banned" } }))).toBeNull();
});

test("a message that cannot be read, and one that was removed", () => {
  expect(to(ev({ content: { type: "undecryptable" } }))!.content).toEqual({ kind: "undecryptable" });
  expect(to(ev({ content: { type: "undecryptable", reason: "noBackup" } }))!.content).toEqual({ kind: "undecryptable", reason: "noBackup" });
  expect(to(ev({ content: { type: "redacted" } }))).toBeNull();
  expect(to(ev({ content: { type: "unsupported", description: "Poll" } }))!.content).toEqual({ kind: "unsupported", body: "Poll" });
  // The invitation of a call is a line of its own: who called whom.
  expect(to(ev({ isOwn: true, content: { type: "call" } }))!.content).toEqual({ kind: "service", body: "You called" });
  expect(to(ev({ isOwn: false, senderName: "Alice", content: { type: "call" } }))!.content).toEqual({ kind: "service", body: "Alice called you" });
});

test("reactions are counted and mine are marked; an empty one is dropped; an edit is noted", () => {
  const item = to(
    ev({
      content: {
        type: "text",
        body: "x",
        edited: true,
        reactions: [
          { key: "👍", senders: ["@alice:s", "@me:s"] },
          { key: "❤️", senders: ["@bob:s"] },
          { key: "😂", senders: [] },
        ],
      },
    }),
  )!;
  expect(item.reactions).toEqual([
    { key: "👍", count: 2, mine: true },
    { key: "❤️", count: 1, mine: false },
  ]);
  expect(item.edited).toBe(true);
  expect(to(ev())!.reactions).toBeUndefined();
});

test("a reply carries what it answers, if the SDK has it", () => {
  const withOriginal = to(
    ev({ content: { type: "text", body: "yes", replyTo: { eventId: "$o", original: { sender: "@bob:s", senderName: "Bob", body: "shall we?" } } } }),
  )!;
  expect(withOriginal.replyTo).toEqual({ id: "$o", sender: "@bob:s", senderName: "Bob", preview: "shall we?" });
  const without = to(ev({ content: { type: "text", body: "yes", replyTo: { eventId: "$o" } } }))!;
  expect(without.replyTo).toEqual({ id: "$o", sender: "", senderName: "", preview: "" });
});

test("a message tells whose receipts sit on it, and never me", () => {
  const readers = [{ userId: "@bob:s", name: "Bob" }, { userId: "@me:s" }];
  expect(to(ev({ isOwn: true, readers }))!.readBy).toEqual([{ userId: "@bob:s", name: "Bob" }]);
  expect(to(ev({ isOwn: false, readers }))!.readBy).toEqual([{ userId: "@bob:s", name: "Bob" }]);
  expect(to(ev({ isOwn: true, readers: [] }))!.readBy).toBeUndefined();
});
