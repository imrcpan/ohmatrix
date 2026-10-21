import { expect, test } from "vitest";
import { adoptSingleSession, createMemoryAccountStore, scopedSessionStore } from "./accounts.js";
import type { SessionStore } from "./platform.js";
import type { Session } from "./types.js";

const session = (user: string, token = "t"): Session => ({ homeserver: "http://s", userId: `@${user}:s`, deviceId: `D${user}`, accessToken: token });

test("accounts keep the order they were added in; a second save of one replaces it in place", async () => {
  const store = createMemoryAccountStore();
  await store.upsert({ session: session("a") });
  await store.upsert({ session: session("b"), dir: "acct-b" });
  await store.upsert({ session: session("a", "fresh") });
  const list = await store.list();
  expect(list.map((a) => a.session.userId)).toEqual(["@a:s", "@b:s"]);
  expect(list[0]!.session.accessToken).toBe("fresh");
  expect(list[1]!.dir).toBe("acct-b");
});

test("removing the active account leaves none active", async () => {
  const store = createMemoryAccountStore([{ session: session("a") }, { session: session("b") }]);
  expect(await store.activeId()).toBe("@a:s");
  await store.remove("@a:s");
  expect(await store.activeId()).toBeNull();
  expect((await store.list()).map((a) => a.session.userId)).toEqual(["@b:s"]);
});

test("a scoped store restores and signs out only its own account", async () => {
  const accounts = createMemoryAccountStore([{ session: session("a") }, { session: session("b") }]);
  const forB = scopedSessionStore(accounts, { userId: "@b:s" });
  expect((await forB.load())?.userId).toBe("@b:s");
  await forB.clear();
  expect((await accounts.list()).map((a) => a.session.userId)).toEqual(["@a:s"]);
  expect(await forB.load()).toBeNull();
});

test("a store for an account being added has nothing to restore, saves under the user id it signed in as, with its folder", async () => {
  const accounts = createMemoryAccountStore([{ session: session("a") }]);
  const adding = scopedSessionStore(accounts, { dir: "acct-c" });
  expect(await adding.load()).toBeNull();
  await adding.clear(); // a failed sign-in clears nothing
  expect(await accounts.list()).toHaveLength(1);
  await adding.save(session("c"));
  expect((await accounts.list()).find((a) => a.session.userId === "@c:s")?.dir).toBe("acct-c");
  // Signing in from it now restores and removes that account.
  expect((await adding.load())?.userId).toBe("@c:s");
  await adding.clear();
  expect(await accounts.list()).toHaveLength(1);
});

test("the session from before there were several becomes the first account, once", async () => {
  let held: Session | null = session("old");
  const old: SessionStore = { load: async () => held, save: async (s) => void (held = s), clear: async () => void (held = null) };
  const accounts = createMemoryAccountStore();
  await adoptSingleSession(old, accounts);
  expect(await accounts.list()).toEqual([{ session: session("old") }]);
  expect(await accounts.activeId()).toBe("@old:s");
  expect(held).toBeNull();
  // Signing out of everything must not bring the old session back on the next start.
  await accounts.remove("@old:s");
  await adoptSingleSession(old, accounts);
  expect(await accounts.list()).toEqual([]);
});

test("a session the caller already read is handed out once, so the store is not read again; after a save or a clear it is read afresh", async () => {
  const inner = createMemoryAccountStore([{ session: session("a") }, { session: session("b") }]);
  let lists = 0;
  const counting = { ...inner, list: () => (lists++, inner.list()) };
  const store = scopedSessionStore(counting, { userId: "@a:s", session: session("a", "read-at-start") });
  expect((await store.load())?.accessToken).toBe("read-at-start");
  expect(lists).toBe(0);
  expect((await store.load())?.accessToken).toBe("t"); // the second load reads
  expect(lists).toBe(1);

  const fresh = scopedSessionStore(counting, { userId: "@a:s", session: session("a", "old") });
  await fresh.save(session("a", "new"));
  expect((await fresh.load())?.accessToken).toBe("new");
});
