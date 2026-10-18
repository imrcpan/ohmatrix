import { expect, test } from "vitest";
import { resolveHomeserver, type FetchLike } from "./discovery.js";

const serving =
  (map: Record<string, unknown>): FetchLike =>
  async (url) => {
    const hit = map[url];
    return { ok: hit !== undefined, json: async () => hit };
  };

test("http addresses are taken literally", async () => {
  const never: FetchLike = async () => {
    throw new Error("must not be called");
  };
  expect(await resolveHomeserver("http://localhost:8008/", never)).toBe("http://localhost:8008");
});

test("a bare name follows .well-known delegation (matrix.org -> its client API host)", async () => {
  const f = serving({ "https://matrix.org/.well-known/matrix/client": { "m.homeserver": { base_url: "https://matrix-client.matrix.org/" } } });
  expect(await resolveHomeserver("matrix.org", f)).toBe("https://matrix-client.matrix.org");
  expect(await resolveHomeserver("https://matrix.org", f)).toBe("https://matrix-client.matrix.org");
  expect(await resolveHomeserver("  matrix.org/  ", f)).toBe("https://matrix-client.matrix.org");
});

test("without a usable well-known the name itself is used over https", async () => {
  expect(await resolveHomeserver("example.org", serving({}))).toBe("https://example.org");
  expect(await resolveHomeserver("example.org", serving({ "https://example.org/.well-known/matrix/client": { "m.homeserver": { base_url: 42 } } }))).toBe(
    "https://example.org",
  );
  expect(
    await resolveHomeserver("example.org", async () => {
      throw new TypeError("network down");
    }),
  ).toBe("https://example.org");
});

test("an explicit path is respected without discovery", async () => {
  expect(await resolveHomeserver("https://hs.example.org/matrix/", serving({}))).toBe("https://hs.example.org/matrix");
});

test("http is never assumed: a bare address, local or not, is looked up and used over https; http is used only when typed", async () => {
  const asked: string[] = [];
  const f: FetchLike = async (url) => {
    asked.push(url);
    throw new Error("no server here");
  };
  expect(await resolveHomeserver("localhost:8008", f)).toBe("https://localhost:8008");
  expect(await resolveHomeserver("192.168.1.161:8008", f)).toBe("https://192.168.1.161:8008");
  expect(await resolveHomeserver("matrix.office.local", f)).toBe("https://matrix.office.local");
  expect(asked).toEqual([
    "https://localhost:8008/.well-known/matrix/client",
    "https://192.168.1.161:8008/.well-known/matrix/client",
    "https://matrix.office.local/.well-known/matrix/client",
  ]);
  const never: FetchLike = async () => {
    throw new Error("must not be called");
  };
  expect(await resolveHomeserver("http://localhost:8008", never)).toBe("http://localhost:8008");
  expect(await resolveHomeserver("https://localhost:8448", serving({}))).toBe("https://localhost:8448");
});
