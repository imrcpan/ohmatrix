import { IDBFactory } from "fake-indexeddb";
import { expect, test } from "vitest";
import type { Session } from "@ohmatrix/core";
import { createSecureBox } from "./secureBox.js";
import { createSecureAccountStore, createSecureSessionStore } from "./secureSession.js";

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

test("accounts are stored sealed, keep their order, and survive a reload; the active one is forgotten when it is removed", async () => {
  const storage = memStorage();
  const box = createSecureBox({ idb: new IDBFactory() });
  const store = createSecureAccountStore(box, storage);
  await store.upsert({ session });
  await store.upsert({ session: { ...session, userId: "@v:hs", accessToken: "syt_other_secret" }, dir: "acct-v" });
  await store.setActive("@v:hs");
  const raw = [...storage.m.values()].join("");
  expect(raw).not.toContain("syt_super_secret_token");
  expect(raw).not.toContain("syt_other_secret");
  const again = createSecureAccountStore(box, storage); // a "reload"
  expect((await again.list()).map((a) => a.session.userId)).toEqual(["@u:hs", "@v:hs"]);
  expect((await again.list())[1]!.dir).toBe("acct-v");
  expect(await again.activeId()).toBe("@v:hs");
  await again.remove("@v:hs");
  expect(await again.activeId()).toBeNull();
  expect(await again.list()).toHaveLength(1);
});

test("accounts saving at the same moment do not lose each other", async () => {
  const store = createSecureAccountStore(createSecureBox({ idb: new IDBFactory() }), memStorage());
  await Promise.all(["a", "b", "c", "d"].map((u) => store.upsert({ session: { ...session, userId: `@${u}:hs` } })));
  expect((await store.list()).map((a) => a.session.userId).sort()).toEqual(["@a:hs", "@b:hs", "@c:hs", "@d:hs"]);
});

test("accounts that cannot be unsealed are dropped, so the user signs in again", async () => {
  const storage = memStorage();
  await createSecureAccountStore(createSecureBox({ idb: new IDBFactory() }), storage).upsert({ session });
  const other = createSecureAccountStore(createSecureBox({ idb: new IDBFactory() }), storage); // another key
  expect(await other.list()).toEqual([]);
  expect(storage.m.size).toBe(0);
});

test("the order the accounts were put in is what a reload finds", async () => {
  const storage = memStorage();
  const box = createSecureBox({ idb: new IDBFactory() });
  const store = createSecureAccountStore(box, storage);
  await store.upsert({ session });
  await store.upsert({ session: { ...session, userId: "@v:hs" }, dir: "acct-v" });
  await store.reorder(["@v:hs", "@u:hs"]);
  expect((await createSecureAccountStore(box, storage).list()).map((a) => a.session.userId)).toEqual(["@v:hs", "@u:hs"]);
});
