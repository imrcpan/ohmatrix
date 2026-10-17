import { expect, test } from "vitest";
import type { Session } from "@ohmatrix/core";
import {
  createAccountStore,
  createSessionStore,
  inAccountDir,
  databasePassphrase,
  forgetDatabasePassphrase,
  pathOfFileUri,
  type SecureKeyValue,
} from "./secureStorage.js";

const memory = (): SecureKeyValue & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItemAsync: async (k) => data.get(k) ?? null,
    setItemAsync: async (k, v) => void data.set(k, v),
    deleteItemAsync: async (k) => void data.delete(k),
  };
};
const session: Session = { homeserver: "http://h", userId: "@a:h", deviceId: "D", accessToken: "secret-token", native: "{}" };

test("a saved session comes back, and signing out removes it", async () => {
  const kv = memory();
  const store = createSessionStore(kv);
  expect(await store.load()).toBeNull();
  await store.save(session);
  expect(await store.load()).toEqual(session);
  await store.clear();
  expect(await store.load()).toBeNull();
});

test("a value that is not a session is dropped, not thrown", async () => {
  const kv = memory();
  const store = createSessionStore(kv);
  kv.data.set("ohmatrix.session.v1", "{broken");
  expect(await store.load()).toBeNull();
  expect(kv.data.has("ohmatrix.session.v1")).toBe(false);
  kv.data.set("ohmatrix.session.v1", JSON.stringify({ userId: "@a:h" })); // missing the token
  expect(await store.load()).toBeNull();
  expect(kv.data.size).toBe(0);
});

test("a keystore that cannot be opened is the same as no session", async () => {
  const kv: SecureKeyValue = { ...memory(), getItemAsync: async () => Promise.reject(new Error("keystore locked")) };
  expect(await createSessionStore(kv).load()).toBeNull();
});

test("the database passphrase is made once and is the same afterwards, until it is forgotten", async () => {
  const kv = memory();
  let calls = 0;
  const random = (n: number) => new Uint8Array(n).fill(++calls);
  const first = await databasePassphrase(kv, random);
  expect(first).toMatch(/^[0-9a-f]{64}$/);
  expect(await databasePassphrase(kv, random)).toBe(first);
  expect(calls).toBe(1);
  await forgetDatabasePassphrase(kv);
  expect(await databasePassphrase(kv, random)).not.toBe(first);
});

test("a file:// folder becomes the plain path the SDK opens", () => {
  expect(pathOfFileUri("file:///data/user/0/org.example/files/")).toBe("/data/user/0/org.example/files");
  expect(pathOfFileUri("file:///data/user/0/org.example/cache")).toBe("/data/user/0/org.example/cache");
  expect(pathOfFileUri("file:///storage/My%20Phone/app/")).toBe("/storage/My Phone/app");
  expect(pathOfFileUri("/already/plain")).toBe("/already/plain");
  expect(pathOfFileUri("file:///100%/x")).toBe("/100%/x"); // not valid percent-encoding: left alone
  expect(pathOfFileUri("file:///")).toBe("/");
});

test("accounts keep their order, each under a key the Keystore accepts, and the active one is forgotten when removed", async () => {
  const kv = memory();
  const store = createAccountStore(kv);
  await store.upsert({ session });
  await store.upsert({ session: { ...session, userId: "@b:h.example", accessToken: "other" }, dir: "acct-b" });
  await store.upsert({ session: { ...session, accessToken: "fresh" } }); // replaced in place
  await store.setActive("@b:h.example");
  for (const key of kv.data.keys()) expect(key).toMatch(/^[A-Za-z0-9._-]+$/);
  const list = await createAccountStore(kv).list(); // a restart
  expect(list.map((a) => a.session.userId)).toEqual(["@a:h", "@b:h.example"]);
  expect(list[0]!.session.accessToken).toBe("fresh");
  expect(list[1]!.dir).toBe("acct-b");
  expect(await store.activeId()).toBe("@b:h.example");
  await store.remove("@b:h.example");
  expect(await store.activeId()).toBeNull();
  expect([...kv.data.keys()].some((k) => k.includes("b_3ah") || k.includes("_40b"))).toBe(false);
});

test("an account that cannot be read back is dropped from the list and removed", async () => {
  const kv = memory();
  const store = createAccountStore(kv);
  await store.upsert({ session });
  await store.upsert({ session: { ...session, userId: "@bad:h" } });
  const badKey = [...kv.data.keys()].find((k) => k.includes("bad"))!;
  kv.data.set(badKey, "{not json");
  expect((await store.list()).map((a) => a.session.userId)).toEqual(["@a:h"]);
  expect(kv.data.has(badKey)).toBe(false);
});

test("saving several accounts at once loses none", async () => {
  const store = createAccountStore(memory());
  await Promise.all(["a", "b", "c"].map((u) => store.upsert({ session: { ...session, userId: `@${u}:h` } })));
  expect((await store.list()).map((a) => a.session.userId)).toEqual(["@a:h", "@b:h", "@c:h"]);
});

test("an account's data folder is its own, except for the first one, which keeps the app's folder", () => {
  expect(inAccountDir("/data/files", undefined)).toBe("/data/files");
  expect(inAccountDir("/data/files/", "acct-1a2b")).toBe("/data/files/acct-1a2b");
});
