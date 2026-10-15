import { expect, test } from "vitest";
import { MEMBERSHIP_CHANGES, readEvent, type RawEvent } from "./readEvent.js";

const raw = (over: Partial<RawEvent> = {}): RawEvent => ({
  eventOrTransactionId: { tag: "EventId", inner: { eventId: "$e1" } },
  sender: "@alice:s",
  senderProfile: { tag: "Ready", inner: { displayName: "Alice", avatarUrl: "mxc://s/a" } },
  isOwn: false,
  timestamp: 1700000000000n,
  content: {
    tag: "MsgLike",
    inner: {
      content: {
        kind: { tag: "Message", inner: { content: { msgType: { tag: "Text", inner: { content: { body: "hi" } } }, isEdited: false } } },
        reactions: [],
      },
    },
  },
  ...over,
});

test("a text message from the server", () => {
  expect(readEvent(raw())).toEqual({
    eventId: "$e1",
    sender: "@alice:s",
    senderName: "Alice",
    senderAvatar: "mxc://s/a",
    isOwn: false,
    timestamp: 1700000000000,
    sendState: undefined,
    readers: [],
    content: { type: "text", body: "hi", reactions: [] },
  });
});

test("a local echo is known by its transaction id, with its send state", () => {
  const e = readEvent(
    raw({ eventOrTransactionId: { tag: "TransactionId", inner: { transactionId: "t1" } }, localSendState: { tag: "NotSentYet" }, isOwn: true }),
  );
  expect(e).toMatchObject({ transactionId: "t1", sendState: "NotSentYet", isOwn: true });
  expect(e.eventId).toBeUndefined();
  expect(readEvent(raw({ localSendState: { tag: "SendingFailed" } })).sendState).toBe("SendingFailed");
});

test("the profile is used only when the SDK has it", () => {
  const e = readEvent(raw({ senderProfile: { tag: "Pending" } }));
  expect(e.senderName).toBeUndefined();
  expect(e.senderAvatar).toBeUndefined();
});

test("formatted text, an edit, reactions and who has read it", () => {
  const e = readEvent(
    raw({
      content: {
        tag: "MsgLike",
        inner: {
          content: {
            kind: {
              tag: "Message",
              inner: { content: { msgType: { tag: "Text", inner: { content: { body: "b", formatted: { body: "<b>b</b>" } } } }, isEdited: true } },
            },
            reactions: [{ key: "👍", senders: [{ senderId: "@bob:s" }, { senderId: "@me:s" }] }],
          },
        },
      },
      readReceipts: new Map([["@bob:s", {}]]),
    }),
  );
  expect(e.content).toEqual({ type: "text", body: "b", formattedBody: "<b>b</b>", edited: true, reactions: [{ key: "👍", senders: ["@bob:s", "@me:s"] }] });
  expect(e.readers).toEqual([{ userId: "@bob:s" }]);
});

test("notices and emotes are text; media is not read here yet and says what it is", () => {
  const msg = (msgType: object) =>
    raw({ content: { tag: "MsgLike", inner: { content: { kind: { tag: "Message", inner: { content: { msgType } } }, reactions: [] } } } });
  expect(readEvent(msg({ tag: "Notice", inner: { content: { body: "n" } } })).content).toMatchObject({ type: "text", body: "n" });
  expect(readEvent(msg({ tag: "Emote", inner: { content: { body: "waves" } } })).content).toMatchObject({ type: "text", body: "waves" });
  expect(readEvent(msg({ tag: "Image", inner: { content: {} } })).content).toEqual({ type: "unsupported", description: "Image" });
});

test("a message that cannot be decrypted, one that was removed, and one of a kind we do not know", () => {
  const kind = (k: object) => raw({ content: { tag: "MsgLike", inner: { content: { kind: k, reactions: [] } } } });
  expect(readEvent(kind({ tag: "UnableToDecrypt" })).content).toEqual({ type: "undecryptable" });
  expect(readEvent(kind({ tag: "Redacted" })).content).toEqual({ type: "redacted" });
  expect(readEvent(kind({ tag: "Poll" })).content).toEqual({ type: "unsupported", description: "Poll" });
  expect(readEvent(raw({ content: { tag: "CallInvite" } })).content).toEqual({ type: "unsupported", description: "CallInvite" });
});

test("membership changes arrive as numbers in the order the SDK declares them", () => {
  const m = (change: number) => readEvent(raw({ content: { tag: "RoomMembership", inner: { userId: "@bob:s", userDisplayName: "Bob", change } } })).content;
  expect(m(2)).toEqual({ type: "membership", userId: "@bob:s", userName: "Bob", change: "Joined" });
  expect(m(7)).toMatchObject({ change: "Invited" });
  expect(m(6)).toMatchObject({ change: "Kicked" });
  expect(MEMBERSHIP_CHANGES).toHaveLength(17);
});

test("state changes carry the new name or topic", () => {
  const s = (tag: string, inner?: object) => readEvent(raw({ content: { tag: "State", inner: { stateKey: "", content: { tag, inner } } } })).content;
  expect(s("RoomName", { name: "Team" })).toEqual({ type: "state", state: { kind: "RoomName", value: "Team" } });
  expect(s("RoomTopic", { topic: "Plans" })).toEqual({ type: "state", state: { kind: "RoomTopic", value: "Plans" } });
  expect(s("RoomCreate")).toEqual({ type: "state", state: { kind: "RoomCreate", value: undefined } });
});
