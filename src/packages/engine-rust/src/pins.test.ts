import { expect, test } from "vitest";
import type { Account, Fetch } from "./devices.js";
import { pinnedOf, readPinned } from "./pins.js";

const account: Account = { homeserverUrl: "http://s/", accessToken: "tok", userId: "@me:s", deviceId: "D" };

test("the ids are the content's pinned list, and nothing else counts", () => {
  expect(pinnedOf({ pinned: ["$a", 3, "$b"] })).toEqual(["$a", "$b"]);
  expect(pinnedOf({ events: ["$old"] })).toEqual([]);
  expect(pinnedOf(undefined)).toEqual([]);
});

test("a room's pins are read with one request; no such state is none, any other refusal is an error", async () => {
  const asked: string[] = [];
  const answer =
    (status: number, body: unknown): Fetch =>
    async (url, init) => {
      asked.push(`${init?.method} ${url} ${init?.headers?.["Authorization"]}`);
      return { ok: status < 300, status, json: async () => body };
    };
  expect(await readPinned(answer(200, { pinned: ["$a"] }), account, "!r:s")).toEqual(["$a"]);
  expect(asked).toEqual(["GET http://s/_matrix/client/v3/rooms/!r%3As/state/m.room.pinned_events/ Bearer tok"]);
  expect(await readPinned(answer(404, { errcode: "M_NOT_FOUND" }), account, "!r:s")).toEqual([]);
  await expect(readPinned(answer(500, {}), account, "!r:s")).rejects.toThrow(/500/);
  await expect(readPinned(async () => Promise.reject(new Error("down")), account, "!r:s")).rejects.toMatchObject({ code: "network" });
});
