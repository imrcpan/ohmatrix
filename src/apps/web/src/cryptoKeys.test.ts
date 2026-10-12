import { IDBFactory } from "fake-indexeddb";
import { expect, test } from "vitest";
import { createCryptoKeyProvider } from "./cryptoKeys.js";
import { createSecureBox } from "./secureBox.js";

const memStorage = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

test("keys are random, stable per store, sealed at rest, and removable", async () => {
  const storage = memStorage();
  const idb = new IDBFactory();
  const p = createCryptoKeyProvider(createSecureBox({ idb }), storage);
  const a = await p.get("store-a");
  expect(a).toHaveLength(32);
  expect(await p.get("store-a")).toEqual(a);
  expect(await p.get("store-b")).not.toEqual(a);
  expect([...storage.m.values()].join("")).not.toContain(btoa(String.fromCharCode(...a)));
  expect(await createCryptoKeyProvider(createSecureBox({ idb }), storage).get("store-a")).toEqual(a);
  await p.remove("store-a");
  expect(await p.get("store-a")).not.toEqual(a);
});

test("an unreadable sealed key is replaced rather than crashing", async () => {
  const storage = memStorage();
  storage.setItem("ohmatrix.cryptokey.v1.s", "Zm9yZWlnbg==");
  const k = await createCryptoKeyProvider(createSecureBox({ idb: new IDBFactory() }), storage).get("s");
  expect(k).toHaveLength(32);
});
