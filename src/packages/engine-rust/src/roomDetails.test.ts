import { expect, test } from "vitest";
import { roleOf, toRoomDetails } from "./roomDetails.js";
import type { RawMember, RawRoomDetails } from "./sdk.js";

const member = (userId: string, over: Partial<RawMember> = {}): RawMember => ({ userId, membership: "Join", power: 0, ...over });
const raw = (over: Partial<RawRoomDetails> = {}): RawRoomDetails => ({
  id: "!r:s",
  name: "Room",
  alternativeAliases: [],
  historyVisibility: "Shared",
  isDirect: false,
  isEncrypted: false,
  muted: false,
  pinnedEventIds: [],
  me: "@me:s",
  members: [member("@me:s", { power: 100 })],
  levels: { invite: 0, kick: 50, ban: 50, redact: 50, eventsDefault: 0, stateDefault: 50 },
  can: { invite: true, kick: true, ban: true, pin: true, editName: true, editTopic: true, joinRules: true, history: true, levels: true },
  ...over,
});

test("a power level reads as the nearest role at or below it", () => {
  expect([0, 25, 50, 99, 100, 200].map(roleOf)).toEqual(["member", "member", "moderator", "moderator", "admin", "admin"]);
});

test("members are joined first then invited, by name; banned ones are listed apart with the reason", () => {
  const d = toRoomDetails(
    raw({
      members: [
        member("@me:s", { power: 100, displayName: "Me" }),
        member("@zed:s", { membership: "Invite", displayName: "Zed" }),
        member("@bob:s", { displayName: "Bob", power: 50 }),
        member("@eve:s", { membership: "Ban", displayName: "Eve", reason: "spam" }),
        member("@gone:s", { membership: "Other" }),
        member("@ann:s"),
      ],
    }),
  );
  expect(d.members.map((m) => m.name)).toEqual(["@ann:s", "Bob", "Me", "Zed"]);
  expect(d.members.find((m) => m.userId === "@zed:s")?.invited).toBe(true);
  expect(d.members.find((m) => m.userId === "@bob:s")).toMatchObject({ role: "moderator", power: 50 });
  expect(d.banned).toEqual([{ userId: "@eve:s", name: "Eve", reason: "spam" }]);
  expect(d.myRole).toBe("admin");
});

test("levels, join rule, history and addresses are mapped", () => {
  const d = toRoomDetails(
    raw({
      joinRule: "KnockRestricted",
      historyVisibility: "WorldReadable",
      canonicalAlias: "#a:s",
      alternativeAliases: ["#b:s", "#a:s"],
      levels: { invite: 10, kick: 20, ban: 30, redact: 40, eventsDefault: 5, stateDefault: 60 },
    }),
  );
  expect(d.joinRule).toBe("restricted");
  expect(d.historyVisibility).toBe("world_readable");
  expect(d.alias).toBe("#a:s");
  expect(d.aliases).toEqual(["#a:s", "#b:s"]);
  expect(d.levels).toEqual({ invite: 10, kick: 20, ban: 30, redact: 40, sendMessages: 5, changeSettings: 60, changeLevels: 60 });
});

test("a room with no join rule is invite-only; an unknown one is `other`", () => {
  expect(toRoomDetails(raw()).joinRule).toBe("invite");
  expect(toRoomDetails(raw({ joinRule: "Custom" })).joinRule).toBe("other");
});

test("a one-to-one chat allows no administration", () => {
  const d = toRoomDetails(raw({ isDirect: true }));
  expect(Object.values(d.can).every((v) => v === false)).toBe(true);
});

test("what I may do follows the room's levels", () => {
  const d = toRoomDetails(
    raw({ can: { invite: true, kick: false, ban: false, pin: false, editName: true, editTopic: false, joinRules: true, history: false, levels: false } }),
  );
  expect(d.can).toEqual({ editInfo: false, invite: true, kick: false, ban: false, changeRoles: false, pin: false, changeSettings: false });
});

test("topic and avatar only when present", () => {
  expect(toRoomDetails(raw())).not.toHaveProperty("topic");
  expect(toRoomDetails(raw({ topic: "hi", avatarUrl: "mxc://s/a" }))).toMatchObject({ topic: "hi", avatar: "mxc://s/a" });
});
