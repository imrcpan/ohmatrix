import { expect, test } from "vitest";
import type { RoomSummary } from "@ohmatrix/core";
import { compareRooms, count, isListed, toRoomSummary, type RoomInfoLike } from "./roomSummary.js";

const info = (over: Partial<RoomInfoLike> = {}): RoomInfoLike => ({
  id: "!r:s",
  displayName: "Team",
  isDirect: false,
  isSpace: false,
  isFavourite: false,
  membership: "Joined",
  joinedMembersCount: 3n,
  numUnreadNotifications: 0n,
  numUnreadMentions: 0n,
  isMarkedUnread: false,
  mutedByUser: false,
  ...over,
});

test("a joined room: its name, counts as numbers, and only the flags that are set", () => {
  const r = toRoomSummary(info({ numUnreadNotifications: 4n, numUnreadMentions: 1n }), { lastActivityTs: 99 });
  expect(r).toEqual({ id: "!r:s", name: "Team", isDirect: false, memberCount: 3, unreadCount: 4, highlightCount: 1, lastActivityTs: 99 });
  const flagged = toRoomSummary(info({ isFavourite: true, isMarkedUnread: true, mutedByUser: true, isSpace: true, avatarUrl: "mxc://s/a" }));
  expect(flagged).toMatchObject({ pinned: true, markedUnread: true, muted: true, isSpace: true, avatar: "mxc://s/a", lastActivityTs: 0 });
});

test("the name falls back from the computed one to the room's own to its id", () => {
  expect(toRoomSummary(info({ displayName: undefined, rawName: "Raw" })).name).toBe("Raw");
  expect(toRoomSummary(info({ displayName: "", rawName: undefined })).name).toBe("!r:s");
});

test("an invitation says who invited, and has no counts or last message", () => {
  const r = toRoomSummary(info({ membership: "Invited", inviter: { userId: "@alice:s", displayName: "Alice" }, numUnreadNotifications: 9n }), {
    lastActivityTs: 5,
    lastMessage: { id: "$1" } as never,
  });
  expect(r.invite).toEqual({ inviter: "Alice" });
  expect(r).toMatchObject({ memberCount: 0, unreadCount: 0, highlightCount: 0 });
  expect(r.lastMessage).toBeUndefined();
  expect(toRoomSummary(info({ membership: "Invited", inviter: { userId: "@bob:s" } })).invite).toEqual({ inviter: "bob" });
  expect(toRoomSummary(info({ membership: "Invited" })).invite).toEqual({ inviter: "" });
});

test("only joined and invited rooms are listed, and bigints become numbers", () => {
  expect(["Joined", "Invited"].every((m) => isListed(m as never))).toBe(true);
  expect(["Left", "Knocked", "Banned"].some((m) => isListed(m as never))).toBe(false);
  expect(count(12n)).toBe(12);
  expect(count(5)).toBe(5);
});

test("the list is ordered invitations, pinned, then the most recent", () => {
  const r = (id: string, o: Partial<RoomSummary>): RoomSummary => ({
    id,
    name: id,
    isDirect: false,
    memberCount: 0,
    unreadCount: 0,
    highlightCount: 0,
    lastActivityTs: 0,
    ...o,
  });
  const list = [
    r("old", { lastActivityTs: 1 }),
    r("pin", { pinned: true, lastActivityTs: 0 }),
    r("new", { lastActivityTs: 9 }),
    r("inv", { invite: { inviter: "x" }, lastActivityTs: 0 }),
  ];
  expect(list.sort(compareRooms).map((x) => x.id)).toEqual(["inv", "pin", "new", "old"]);
});
