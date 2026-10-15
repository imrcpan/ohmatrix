import { expect, test } from "vitest";
import { isLocalHost, resolveHomeserver, type FetchLike } from "./discovery.js";

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

test("a bare local address means plain http (such servers have no certificate); an explicit https wins", async () => {
  const never: FetchLike = async () => {
    throw new Error("must not be called");
  };
  expect(await resolveHomeserver("localhost:8008", never)).toBe("http://localhost:8008");
  expect(await resolveHomeserver("127.0.0.1:8008/", never)).toBe("http://127.0.0.1:8008");
  expect(await resolveHomeserver("192.168.1.161:8008", never)).toBe("http://192.168.1.161:8008");
  expect(await resolveHomeserver("matrix.office.local", never)).toBe("http://matrix.office.local");
  expect(await resolveHomeserver("https://localhost:8448", serving({}))).toBe("https://localhost:8448");
});

test("isLocalHost", () => {
  for (const h of ["localhost", "localhost:8008", "127.0.0.1", "10.1.2.3", "172.16.0.9", "172.31.255.1", "192.168.0.2:8008", "foo.local", "[::1]:8008"])
    expect(isLocalHost(h), h).toBe(true);
  for (const h of ["matrix.org", "172.32.0.1", "172.15.0.1", "8.8.8.8", "example.org:8448", "localhost.example.com"]) expect(isLocalHost(h), h).toBe(false);
});
