import { expect, test } from "vitest";
import { exploreRooms } from "./explore.js";
import type { Account, Fetch } from "./devices.js";

const account: Account = { homeserverUrl: "http://s/", accessToken: "tok", userId: "@me:s", deviceId: "B" };

test("the directory page becomes rooms, named by what they have, with the next page's token", async () => {
  const log: { url: string; body: unknown }[] = [];
  const f: Fetch = async (url, init) => {
    log.push({ url, body: JSON.parse(init!.body!) });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        chunk: [
          { room_id: "!a:s", name: "Lobby", topic: "Hi", canonical_alias: "#lobby:s", num_joined_members: 9 },
          { room_id: "!b:s", canonical_alias: "#b:s" },
          { room_id: "!c:s" },
        ],
        next_batch: "n1",
      }),
    };
  };
  expect(await exploreRooms(f, account, " cats ", "p0")).toEqual({
    rooms: [
      { roomId: "!a:s", name: "Lobby", topic: "Hi", alias: "#lobby:s", members: 9 },
      { roomId: "!b:s", name: "#b:s", alias: "#b:s", members: 0 },
      { roomId: "!c:s", name: "!c:s", members: 0 },
    ],
    next: "n1",
  });
  expect(log[0]).toEqual({ url: "http://s/_matrix/client/v3/publicRooms", body: { limit: 20, filter: { generic_search_term: "cats" }, since: "p0" } });
});

test("an empty term asks for the whole directory, and a refusal is an error", async () => {
  const log: unknown[] = [];
  const f: Fetch = async (_url, init) => {
    log.push(JSON.parse(init!.body!));
    return { ok: false, status: 401, json: async () => ({ error: "no" }) };
  };
  await expect(exploreRooms(f, account, "")).rejects.toMatchObject({ code: "unauthorized" });
  expect(log[0]).toEqual({ limit: 20 });
});
