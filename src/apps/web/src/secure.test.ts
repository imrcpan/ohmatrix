import { IDBFactory } from "fake-indexeddb";
import { expect, test } from "vitest";
import type { Session } from "@ohmatrix/core";
import { createSecureBox } from "./secureBox.js";
import { createSecureSessionStore } from "./secureSession.js";

const memStorage = () => {
  const m = new Map<string, string>();
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};
const session: Session = { homeserver: "http://hs", userId: "@u:hs", deviceId: "DEV", accessToken: "syt_super_secret_token" };

test("box encrypts, never reveals plaintext, and rejects tampering", async () => {
  const box = createSecureBox({ idb: new IDBFactory() });
  const sealed = await box.encrypt("hello secret");
  expect(sealed).not.toContain("hello");
  expect(await box.decrypt(sealed)).toBe("hello secret");
  expect(await box.encrypt("hello secret")).not.toBe(sealed); // fresh IV every time
  const bad = sealed.slice(0, -4) + (sealed.endsWith("AAAA") ? "BBBB" : "AAAA");
  await expect(box.decrypt(bad)).rejects.toThrow();
});

test("the key persists in IndexedDB across box instances, and is not extractable", async () => {
  const idb = new IDBFactory();
  const a = createSecureBox({ idb });
  const sealed = await a.encrypt("persisted");
  const b = createSecureBox({ idb }); // a "reload"
  expect(await b.decrypt(sealed)).toBe("persisted");
  const other = createSecureBox({ idb: new IDBFactory() }); // another browser profile cannot read it
  await expect(other.decrypt(sealed)).rejects.toThrow();
  const db: IDBDatabase = await new Promise((res) => {
    const r = idb.open("ohmatrix-secure", 1);
    r.onsuccess = () => res(r.result);
  });
  const key: CryptoKey = await new Promise((res) => {
    const r = db.transaction("keys").objectStore("keys").get("master");
    r.onsuccess = () => res(r.result);
  });
  expect(key.extractable).toBe(false);
  await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
});

test("session store keeps the token out of storage and upgrades the old plaintext entry", async () => {
  const storage = memStorage();
  const store = createSecureSessionStore(createSecureBox({ idb: new IDBFactory() }), storage);
  expect(await store.load()).toBeNull();
  await store.save(session);
  expect([...storage.m.values()].join("")).not.toContain("syt_super_secret_token");
  expect(await store.load()).toEqual(session);
  await store.clear();
  expect(await store.load()).toBeNull();

  const old = memStorage();
  old.setItem("ohmatrix.session.v1", JSON.stringify(session));
  const upgraded = createSecureSessionStore(createSecureBox({ idb: new IDBFactory() }), old);
  expect(await upgraded.load()).toEqual(session);
  expect(old.getItem("ohmatrix.session.v1")).toBeNull();
  expect([...old.m.values()].join("")).not.toContain("syt_super_secret_token");
  expect(await upgraded.load()).toEqual(session); // and keeps loading from the encrypted copy
});

test("corrupt or foreign data is discarded instead of crashing", async () => {
  const storage = memStorage();
  storage.setItem("ohmatrix.session.v2", "bm90IGEgcmVhbCBzZWFsZWQgdmFsdWU=");
  const store = createSecureSessionStore(createSecureBox({ idb: new IDBFactory() }), storage);
  expect(await store.load()).toBeNull();
  expect(storage.getItem("ohmatrix.session.v2")).toBeNull();
});
