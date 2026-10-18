import { expect, test } from "vitest";
import { createMemoryAccountStore, type Preferences, type Session } from "@ohmatrix/core";
import { MockEngine } from "@ohmatrix/engine-mock";
import { createAccountManager, NEW_ACCOUNT, type AccountManager } from "./accounts.js";

const until = async (cond: () => boolean) => {
  for (let i = 0; i < 2000 && !cond(); i++) await Promise.resolve(); // the mock engine only ever waits on microtasks
  expect(cond()).toBe(true);
};
const session = (user: string): Session => ({ homeserver: "http://h", userId: `@${user}:h`, deviceId: `D${user}`, accessToken: "t" });
const setup = (initial: string[] = [], extra: Partial<Parameters<typeof createAccountManager>[0]> = {}) => {
  const accounts = createMemoryAccountStore(initial.map((u) => ({ session: session(u) })));
  const forgotten: Array<{ userId: string | null; dir?: string | undefined }> = [];
  let n = 0;
  const manager = createAccountManager({
    accounts,
    services: {},
    makeEngine: () => new MockEngine(),
    newDir: () => `acct-${++n}`,
    forget: async (a) => void forgotten.push(a),
    ...extra,
  });
  return { accounts, manager, forgotten };
};
const signInAs = async (m: AccountManager, user: string) => {
  const c = m.current();
  await until(() => c.store.getState().auth === "signedOut");
  await c.login("http://h", user, "pw");
  await until(() => m.store.getState().accounts.some((a) => a.userId === `@${user}:h`));
};

test("with no account the sign-in screen shows; signing in makes the first account and shows it", async () => {
  const { accounts, manager } = setup();
  await manager.start();
  expect(manager.store.getState()).toMatchObject({ currentKey: NEW_ACCOUNT, adding: true, ready: true, accounts: [] });
  await signInAs(manager, "test");
  expect(manager.store.getState()).toMatchObject({ currentKey: "@test:h", adding: false });
  expect(manager.current().store.getState().userId).toBe("@test:h");
  expect((await accounts.list()).map((a) => a.session.userId)).toEqual(["@test:h"]);
  expect(await accounts.activeId()).toBe("@test:h");
});

test("saved accounts all start, and the one that was active shows", async () => {
  const { accounts, manager } = setup(["a", "b"]);
  await accounts.setActive("@b:h");
  await manager.start();
  expect(manager.store.getState().currentKey).toBe("@b:h");
  await until(() => ["@a:h", "@b:h"].every((u) => manager.controllerOf(u)?.store.getState().auth === "signedIn"));
});

test("a second account is added from the sign-in screen, gets a folder of its own, and can be switched to and back", async () => {
  const { accounts, manager } = setup(["a"]);
  await manager.start();
  manager.beginAdd();
  expect(manager.store.getState()).toMatchObject({ currentKey: NEW_ACCOUNT, adding: true });
  await signInAs(manager, "b");
  expect(manager.store.getState().accounts.map((a) => a.userId)).toEqual(["@a:h", "@b:h"]);
  expect(manager.store.getState().currentKey).toBe("@b:h");
  expect((await accounts.list()).find((a) => a.session.userId === "@b:h")?.dir).toBe("acct-1");
  manager.switchTo("@a:h");
  expect(manager.current()).toBe(manager.controllerOf("@a:h"));
  expect(await accounts.activeId()).toBe("@a:h");
});

test("cancelling the sign-in goes back to the account that was showing; with no account there is nothing to go back to", async () => {
  const { manager } = setup(["a", "b"]);
  await manager.start();
  manager.switchTo("@b:h");
  manager.beginAdd();
  manager.cancelAdd();
  expect(manager.store.getState()).toMatchObject({ currentKey: "@b:h", adding: false });
  const empty = setup();
  await empty.manager.start();
  empty.manager.cancelAdd();
  expect(empty.manager.store.getState().currentKey).toBe(NEW_ACCOUNT);
});

test("signing in as an account that is already there is refused and changes nothing", async () => {
  const { accounts, manager } = setup(["a"]);
  await manager.start();
  await until(() => manager.controllerOf("@a:h")?.store.getState().auth === "signedIn");
  manager.beginAdd();
  const c = manager.current();
  await until(() => c.store.getState().auth === "signedOut");
  await c.login("http://h", "a", "pw");
  expect(c.store.getState()).toMatchObject({ auth: "signedOut", authErrorCode: "conflict" });
  expect(manager.store.getState().accounts).toHaveLength(1);
  expect(await accounts.list()).toHaveLength(1);
});

test("removing an account signs it out, deletes what it left, and the next one takes over; the last one leaves the sign-in screen", async () => {
  const { accounts, manager, forgotten } = setup(["a", "b"]);
  await manager.start();
  await manager.remove("@a:h");
  expect(manager.store.getState()).toMatchObject({ currentKey: "@b:h", accounts: [expect.objectContaining({ userId: "@b:h" })] });
  expect(forgotten.map((f) => f.userId)).toEqual(["@a:h"]);
  expect((await accounts.list()).map((a) => a.session.userId)).toEqual(["@b:h"]);
  await manager.remove("@b:h");
  expect(manager.store.getState()).toMatchObject({ currentKey: NEW_ACCOUNT, adding: true, accounts: [] });
  expect(await accounts.activeId()).toBeNull();
  expect(manager.current().store.getState().userId).toBeNull();
});

test("removing an account that is not showing leaves the one showing alone", async () => {
  const { manager } = setup(["a", "b"]);
  await manager.start();
  await manager.remove("@b:h");
  expect(manager.store.getState().currentKey).toBe("@a:h");
});

test("an account whose session the server ended is dropped, and the next one shows", async () => {
  const dead = new MockEngine();
  dead.auth.restore = async () => {
    const { EngineError } = await import("@ohmatrix/core");
    throw new EngineError("unauthorized", "token expired");
  };
  const { accounts, manager } = setup(["a", "b"], { makeEngine: (dir) => (dir === "dead" ? dead : new MockEngine()) });
  await accounts.upsert({ session: session("a"), dir: "dead" });
  await accounts.setActive("@a:h");
  await manager.start();
  await until(() => manager.store.getState().accounts.length === 1);
  expect(manager.store.getState().currentKey).toBe("@b:h");
  expect((await accounts.list()).map((a) => a.session.userId)).toEqual(["@b:h"]);
});

test("preferences are the device's: a change in one account shows in all", async () => {
  const { manager } = setup(["a", "b"]);
  await manager.start();
  manager.controllerOf("@a:h")!.setPreferences({ theme: "dark" } as Partial<Preferences>);
  expect(manager.controllerOf("@b:h")!.store.getState().prefs).toMatchObject({ theme: "dark" });
});

test("the session from before there were several becomes the first account", async () => {
  let held: Session | null = session("old");
  const { manager, accounts } = setup([], {
    legacySessions: { load: async () => held, save: async (s) => void (held = s), clear: async () => void (held = null) },
  });
  await manager.start();
  expect(manager.store.getState().currentKey).toBe("@old:h");
  expect((await accounts.list()).map((a) => a.session.userId)).toEqual(["@old:h"]);
  expect(held).toBeNull();
});

test("an account whose start failed for another reason (no network) stays, with its session, instead of being dropped", async () => {
  const down = new MockEngine();
  down.auth.restore = async () => {
    const { EngineError } = await import("@ohmatrix/core");
    throw new EngineError("network", "offline");
  };
  const { accounts, manager } = setup(["a", "b"], { makeEngine: (dir) => (dir === "down" ? down : new MockEngine()) });
  await accounts.upsert({ session: session("a"), dir: "down" });
  await manager.start();
  await until(() => manager.controllerOf("@a:h")?.store.getState().auth === "signedOut");
  await until(() => manager.controllerOf("@b:h")?.store.getState().auth === "signedIn");
  expect(manager.store.getState().accounts.map((a) => a.userId)).toEqual(["@a:h", "@b:h"]);
  expect((await accounts.list()).map((a) => a.session.userId)).toEqual(["@a:h", "@b:h"]);
});

const deferred = () => {
  let release!: () => void;
  const done = new Promise<void>((r) => (release = r));
  return { done, release };
};

test("a refused duplicate is signed out of the server again, so no stray device is left", async () => {
  const engines = new Map<string | undefined, MockEngine>();
  const { manager } = setup(["a"], {
    makeEngine: (dir) => {
      const e = new MockEngine();
      engines.set(dir, e);
      return e;
    },
  });
  await manager.start();
  manager.beginAdd();
  const c = manager.current();
  await until(() => c.store.getState().auth === "signedOut");
  let loggedOut = 0;
  engines.get("acct-1")!.auth.logout = async () => void loggedOut++;
  await c.login("http://h", "a", "pw");
  expect(c.store.getState().authErrorCode).toBe("conflict");
  expect(loggedOut).toBe(1);
});

test("a sign-in that is given up takes the folder it was given with it", async () => {
  const { manager, forgotten } = setup(["a"]);
  await manager.start();
  manager.beginAdd();
  manager.cancelAdd();
  expect(forgotten).toEqual([{ userId: null, dir: "acct-1" }]);
  manager.beginAdd();
  manager.switchTo("@a:h");
  expect(forgotten.at(-1)).toEqual({ userId: null, dir: "acct-2" });
});

test("a sign-in that is under way cannot be cancelled away (it would still save its account); and finishing does not pull someone back from another account", async () => {
  const gate = deferred();
  const slow = new MockEngine();
  const login = slow.auth.loginWithPassword;
  slow.auth.loginWithPassword = async (...args: Parameters<typeof login>) => {
    await gate.done;
    return login(...args);
  };
  const { accounts, manager } = setup(["a"], { makeEngine: (dir) => (dir === "acct-1" ? slow : new MockEngine()) });
  await manager.start();
  manager.beginAdd();
  const c = manager.current();
  await until(() => c.store.getState().auth === "signedOut");
  const signing = c.login("http://h", "b", "pw");
  await until(() => c.store.getState().auth === "signingIn");
  manager.cancelAdd();
  expect(manager.store.getState().currentKey).toBe(NEW_ACCOUNT); // refused
  manager.switchTo("@a:h"); // someone else asks to show a (a notification was pressed)
  expect(manager.store.getState().currentKey).toBe("@a:h");
  gate.release();
  await signing;
  await until(() => manager.store.getState().accounts.length === 2);
  expect(manager.store.getState().currentKey).toBe("@a:h"); // not pulled to b
  expect((await accounts.list()).map((a) => a.session.userId)).toEqual(["@a:h", "@b:h"]);
});

test("while an account is being removed there is never a moment with nothing to show", async () => {
  const { manager } = setup(["a", "b"]);
  await manager.start();
  const seen: string[] = [];
  manager.store.subscribe(() => {
    try {
      manager.current();
    } catch (e) {
      seen.push(String(e));
    }
  });
  await manager.remove("@a:h");
  await manager.remove("@b:h");
  expect(seen).toEqual([]);
});

test("when the last account ends because its keys are lost, the sign-in screen that follows says why", async () => {
  const lost = new MockEngine();
  lost.auth.restore = async () => {
    const { EngineError } = await import("@ohmatrix/core");
    throw new EngineError("keys_lost", "The encryption keys of this device are unavailable.");
  };
  const { accounts, manager } = setup(["a"], { makeEngine: () => lost });
  await manager.start();
  await until(() => manager.store.getState().currentKey === NEW_ACCOUNT);
  const sign = manager.current();
  await until(() => sign.store.getState().authError !== null);
  expect(sign.store.getState()).toMatchObject({ auth: "signedOut", authError: expect.stringContaining("keys") });
  expect(await accounts.list()).toEqual([]);
});
