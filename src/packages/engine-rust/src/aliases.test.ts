import { expect, test } from "vitest";
import { addAlias, aliasLocalpart, aliasOn, checkAlias, removeAlias, setMainAlias } from "./aliases.js";
import type { Account, Fetch } from "./devices.js";

const account: Account = { homeserverUrl: "http://s", accessToken: "t", userId: "@me:example.org", deviceId: "D" };
const serve = (status = 200) => {
  const asked: [string, string, unknown][] = [];
  const f: Fetch = async (url, init) => {
    asked.push([init?.method ?? "GET", decodeURIComponent(url.replace("http://s/_matrix/client/v3/", "")), init?.body ? JSON.parse(init.body) : undefined]);
    return { ok: status < 300, status, json: async () => ({}) };
  };
  return { f, asked };
};

test("what is typed becomes an address on my server", () => {
  expect(["#Team:x", "team:x", " Team ", "My Room"].map(aliasLocalpart)).toEqual(["team", "team", "team", "my-room"]);
  expect(aliasOn(account, "#Team")).toBe("#team:example.org");
  expect(() => aliasOn(account, "bad!name")).toThrow("invalid address");
});

test("a new address is made and listed; the first one becomes the main one", async () => {
  const { f, asked } = serve();
  expect(await addAlias(f, account, "!r:s", "team", { others: [] })).toBe("#team:example.org");
  expect(asked).toEqual([
    ["PUT", "directory/room/#team:example.org", { room_id: "!r:s" }],
    ["PUT", "rooms/!r:s/state/m.room.canonical_alias/", { alias: "#team:example.org", alt_aliases: [] }],
  ]);
  const second = serve();
  await addAlias(second.f, account, "!r:s", "more", { main: "#team:example.org", others: [] });
  expect(second.asked[1]?.[2]).toEqual({ alias: "#team:example.org", alt_aliases: ["#more:example.org"] });
});

test("removing the main address promotes the next; a main one is chosen from those listed", async () => {
  const { f, asked } = serve();
  expect(await removeAlias(f, account, "!r", "#a:example.org", { main: "#a:example.org", others: ["#b:s", "#c:s"] })).toBe("released");
  expect(asked.map((x) => [x[0], x[2]])).toEqual([
    ["PUT", { alias: "#b:s", alt_aliases: ["#c:s"] }],
    ["DELETE", undefined],
  ]);
  // A name that belongs to another server cannot be freed from here: it is unlisted, and no delete is sent to this server.
  const far = serve();
  expect(await removeAlias(far.f, account, "!r", "#x:s", { main: "#x:s", others: [] })).toBe("unlisted");
  expect(far.asked.map((x) => x[0])).toEqual(["PUT"]);
  const main = serve();
  await setMainAlias(main.f, account, "!r", "#c:s", { main: "#a:s", others: ["#c:s"] });
  expect(main.asked[0]?.[2]).toEqual({ alias: "#c:s", alt_aliases: ["#a:s"] });
  await expect(setMainAlias(main.f, account, "!r", "#zzz:s", { others: [] })).rejects.toMatchObject({ code: "not_found" });
});

test("a taken address is a conflict", async () => {
  await expect(addAlias(serve(409).f, account, "!r", "team", { others: [] })).rejects.toMatchObject({ code: "conflict" });
});

test("the name is checked against the directory without making anything: free on 404, taken on a room, invalid before asking", async () => {
  const free = serve(404);
  expect(await checkAlias(free.f, account, "Team")).toBe("free");
  expect(free.asked).toEqual([["GET", "directory/room/#team:example.org", undefined]]);
  const taken = serve(200);
  expect(await checkAlias(taken.f, account, "#team:x")).toBe("taken");
  const none = serve(200);
  expect(await checkAlias(none.f, account, "bad!name")).toBe("invalid");
  expect(await checkAlias(none.f, account, "  ")).toBe("invalid");
  expect(none.asked).toEqual([]);
  await expect(checkAlias(serve(500).f, account, "team")).rejects.toMatchObject({ code: "unknown" });
  const down: Fetch = async () => {
    throw new Error("offline");
  };
  await expect(checkAlias(down, account, "team")).rejects.toMatchObject({ code: "network" });
});
