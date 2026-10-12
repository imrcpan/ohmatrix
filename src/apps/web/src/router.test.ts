import { expect, test } from "vitest";
import { buildPath, parseLocation, type Route } from "./router.js";

const roundTrip = (r: Route) => parseLocation(...((buildPath(r).split("?") as [string, string?]).map((x, i) => (i === 1 ? `?${x}` : x)) as [string, string?]));

test("paths are clean and readable", () => {
  expect(buildPath({ page: "chats", room: null, info: false })).toBe("/");
  expect(buildPath({ page: "profile", room: null, info: false })).toBe("/profile");
  expect(buildPath({ page: "settings", room: null, info: false })).toBe("/settings");
  expect(buildPath({ page: "sessions", room: null, info: false })).toBe("/sessions");
  expect(buildPath({ page: "chats", room: "!abc:matrix.org", info: false })).toBe("/chat/!abc:matrix.org");
  expect(buildPath({ page: "chats", room: "!abc:matrix.org", info: true })).toBe("/chat/!abc:matrix.org/info");
  expect(buildPath({ page: "profile", room: "!abc:localhost", info: false })).toBe("/chat/!abc:localhost?panel=profile");
});

test("parse is the inverse of build", () => {
  const routes: Route[] = [
    { page: "chats", room: null, info: false },
    { page: "profile", room: null, info: false },
    { page: "settings", room: null, info: false },
    { page: "sessions", room: null, info: false },
    { page: "chats", room: "!a/b c:server", info: true },
    { page: "settings", room: "!x:localhost", info: false },
  ];
  for (const r of routes) expect(roundTrip(r)).toEqual(r);
});

test("unknown paths fall back to the chat list; broken escapes do not throw", () => {
  expect(parseLocation("/nope/at/all")).toEqual({ page: "chats", room: null, info: false });
  expect(parseLocation("/chat")).toEqual({ page: "chats", room: null, info: false });
  expect(parseLocation("/chat/%E0%A4%A")).toMatchObject({ room: "%E0%A4%A" });
});

test("first-version hash links still work", () => {
  expect(parseLocation("/", "", "#/chats/room/!x:localhost")).toEqual({ page: "chats", room: "!x:localhost", info: false });
  expect(parseLocation("/", "", "#/profile/room/!x%3Alocalhost/info")).toEqual({ page: "profile", room: "!x:localhost", info: true });
  expect(parseLocation("/", "", "#/settings")).toEqual({ page: "settings", room: null, info: false });
});
