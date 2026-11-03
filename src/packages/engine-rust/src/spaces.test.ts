import { expect, test } from "vitest";
import type { Account, Fetch } from "./devices.js";
import { orderFor, putState, readChildren, toSpaceChild } from "./spaces.js";

const account: Account = { homeserverUrl: "http://s", accessToken: "t", userId: "@me:s", deviceId: "D" };
const reply =
  (status: number, body: unknown): Fetch =>
  async () => ({ ok: status < 300, status, json: async () => body });

test("a space's children come in the space's order, the ones without a via are not children, and the server's names are kept", async () => {
  const f = reply(200, {
    rooms: [
      {
        room_id: "!s",
        children_state: [
          { state_key: "!c", content: { order: "10", via: ["s"] } },
          { state_key: "!a", content: { order: "2", via: ["s"] } },
          { state_key: "!gone", content: {} },
          { state_key: "!z", content: { via: ["s"] } },
        ],
      },
      { room_id: "!a", name: "Alpha", avatar_url: "mxc://s/a" },
      { room_id: "!c", name: "Sub", room_type: "m.space" },
    ],
  });
  const kids = await readChildren(f, account, "!s");
  expect(kids.map((k) => k.roomId)).toEqual(["!a", "!c", "!z"]);
  expect(kids[0]).toMatchObject({ name: "Alpha", avatar: "mxc://s/a", isSpace: false });
  expect(kids[1]).toMatchObject({ isSpace: true });
});

test("an unknown space is not found", async () => {
  await expect(readChildren(reply(404, {}), account, "!s")).rejects.toMatchObject({ code: "not_found" });
});

test("moving a child to the start or the end picks an order past the others", () => {
  const kids = [
    { roomId: "!a", via: [], order: "3", isSpace: false },
    { roomId: "!b", via: [], order: "7", isSpace: false },
    { roomId: "!c", via: [], order: undefined, isSpace: false },
  ];
  expect(orderFor(kids, "!c", "last")).toBe("8");
  expect(orderFor(kids, "!c", "first")).toBe("-1");
  expect(orderFor(kids, "!b", "last")).toBe("4");
});

test("a state change goes to the room's state; a refusal is forbidden", async () => {
  const seen: { url: string; method?: string | undefined; body?: string | undefined }[] = [];
  const f: Fetch = async (url, init) => {
    seen.push({ url, method: init?.method, body: init?.body });
    return { ok: true, status: 200, json: async () => ({}) };
  };
  await putState(f, account, "!s:x", "m.space.child", "!c:x", { via: ["x"] });
  expect(seen).toEqual([{ url: "http://s/_matrix/client/v3/rooms/!s%3Ax/state/m.space.child/!c%3Ax", method: "PUT", body: '{"via":["x"]}' }]);
  await expect(putState(reply(403, {}), account, "!s", "m.space.child", "!c", {})).rejects.toMatchObject({ code: "forbidden" });
});

test("a joined child shows my own name and counts; one I have not joined shows what the server says and how to reach it", () => {
  const k = { roomId: "!a", via: ["s"], order: "1", name: "Server name", isSpace: false };
  expect(toSpaceChild(k, { name: "Mine", unreadCount: 2, highlightCount: 1 })).toEqual({
    roomId: "!a",
    name: "Mine",
    isSpace: false,
    unreadCount: 2,
    highlightCount: 1,
  });
  expect(toSpaceChild(k, undefined)).toEqual({
    roomId: "!a",
    name: "Server name",
    isSpace: false,
    via: ["s"],
    detailed: true, // the server has answered: there is no topic and no count to wait for
    unreadCount: 0,
    highlightCount: 0,
  });
  // What the server tells of a room I am not in is what its card shows; one I am in keeps to my own.
  const told = { ...k, topic: "About it", alias: "#a:s", members: 12 };
  expect(toSpaceChild(told, undefined)).toMatchObject({ topic: "About it", alias: "#a:s", members: 12, detailed: true });
  expect(toSpaceChild(told, { name: "Mine", unreadCount: 0, highlightCount: 0 })).not.toHaveProperty("topic");
});
