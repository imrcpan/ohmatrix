import { expect, test } from "vitest";
import { createMemoryAccountStore, type Session } from "@ohmatrix/core";
import { retireOldStores } from "./storeFormat.js";
import type { SecureKeyValue } from "./secureStorage.js";

const session = (user: string): Session => ({ homeserver: "http://h", userId: `@${user}:h`, deviceId: "D", accessToken: "t" });
const memory = (): SecureKeyValue & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItemAsync: async (k) => data.get(k) ?? null,
    setItemAsync: async (k, v) => void data.set(k, v),
    deleteItemAsync: async (k) => void data.delete(k),
  };
};

test("the first start of this kind of database drops the old accounts, their files and the old passphrase, once", async () => {
  const kv = memory();
  kv.data.set("ohmatrix.db-passphrase.v1", "old");
  const accounts = createMemoryAccountStore([{ session: session("a") }, { session: session("b"), dir: "acct-1" }]);
  let cleared = 0;
  let deleted = 0;
  const deps = {
    kv,
    accounts,
    legacySessions: { load: async () => null, save: async () => {}, clear: async () => void cleared++ },
    deleteFiles: () => void deleted++,
  };

  expect(await retireOldStores(deps)).toBe(true);
  expect(await accounts.list()).toEqual([]);
  expect([cleared, deleted]).toEqual([1, 1]);
  expect(kv.data.has("ohmatrix.db-passphrase.v1")).toBe(false);

  // An account made after that is left alone by the next start.
  await accounts.upsert({ session: session("c") });
  expect(await retireOldStores(deps)).toBe(false);
  expect((await accounts.list()).map((a) => a.session.userId)).toEqual(["@c:h"]);
  expect([cleared, deleted]).toEqual([1, 1]);
});

test("a keystore that cannot be read is treated as not done yet, and nothing is left half done when it works again", async () => {
  const kv = memory();
  const flaky: SecureKeyValue = { ...kv, getItemAsync: async () => Promise.reject(new Error("locked")) };
  const accounts = createMemoryAccountStore([{ session: session("a") }]);
  const deps = { kv: flaky, accounts, legacySessions: { load: async () => null, save: async () => {}, clear: async () => {} }, deleteFiles: () => {} };
  expect(await retireOldStores(deps)).toBe(true);
  expect(await accounts.list()).toEqual([]);
});
