import { expect, test } from "vitest";
import type { Session } from "@ohmatrix/core";
import { createSessionStore, databasePassphrase, forgetDatabasePassphrase, pathOfFileUri, type SecureKeyValue } from "./secureStorage.js";

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
