import { inOrder, type AccountStore, type Session, type SessionStore, type StoredAccount, type UserId } from "@ohmatrix/core";
import type { SecureBox } from "./secureBox.js";

const LEGACY_KEY = "ohmatrix.session.v1"; // plaintext JSON, written by early versions
const KEY = "ohmatrix.session.v2"; // encrypted with the SecureBox

/** Session persistence that never writes the access token in the clear. */
export function createSecureSessionStore(box: SecureBox, storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = localStorage): SessionStore {
  const save = async (s: Session) => storage.setItem(KEY, await box.encrypt(JSON.stringify(s)));
  return {
    async load() {
      const sealed = storage.getItem(KEY);
      if (sealed) {
        try {
          return JSON.parse(await box.decrypt(sealed)) as Session;
        } catch {
          storage.removeItem(KEY);
          return null;
        }
      }
      const legacy = storage.getItem(LEGACY_KEY); // upgrade in place
      if (!legacy) return null;
      try {
        const s = JSON.parse(legacy) as Session;
        await save(s);
        storage.removeItem(LEGACY_KEY);
        return s;
      } catch {
        storage.removeItem(LEGACY_KEY);
        return null;
      }
    },
    save,
    async clear() {
      storage.removeItem(KEY);
      storage.removeItem(LEGACY_KEY);
    },
  };
}

const ACCOUNTS_KEY = "ohmatrix.accounts.v1"; // every account and which one is showing, sealed with the SecureBox

interface Saved {
  accounts: StoredAccount[];
  active: UserId | null;
}

/** All signed-in accounts in one sealed value, so no access token is written in the clear. */
export function createSecureAccountStore(box: SecureBox, storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = localStorage): AccountStore {
  const read = async (): Promise<Saved> => {
    const sealed = storage.getItem(ACCOUNTS_KEY);
    if (!sealed) return { accounts: [], active: null };
    try {
      const v = JSON.parse(await box.decrypt(sealed)) as Partial<Saved>;
      return { accounts: Array.isArray(v.accounts) ? v.accounts : [], active: typeof v.active === "string" ? v.active : null };
    } catch {
      storage.removeItem(ACCOUNTS_KEY); // damaged, or sealed by a lost key: the accounts have to sign in again
      return { accounts: [], active: null };
    }
  };
  const write = async (v: Saved) => storage.setItem(ACCOUNTS_KEY, await box.encrypt(JSON.stringify(v)));
  // One write at a time: two accounts saving their refreshed tokens together must not lose one of them.
  let queue: Promise<unknown> = Promise.resolve();
  const change = <T>(fn: (v: Saved) => T | Promise<T>): Promise<T> => {
    const run = queue.then(async () => {
      const v = await read();
      const out = await fn(v);
      await write(v);
      return out;
    });
    queue = run.catch(() => {});
    return run;
  };
  return {
    list: async () => (await read()).accounts,
    upsert: (account) =>
      change((v) => {
        const at = v.accounts.findIndex((a) => a.session.userId === account.session.userId);
        if (at < 0) v.accounts.push(account);
        else v.accounts[at] = account;
      }),
    remove: (userId) =>
      change((v) => {
        v.accounts = v.accounts.filter((a) => a.session.userId !== userId);
        if (v.active === userId) v.active = null;
      }),
    reorder: (userIds) =>
      change((v) => {
        v.accounts = inOrder(v.accounts, userIds, (a) => a.session.userId);
      }),
    activeId: async () => (await read()).active,
    setActive: (userId) =>
      change((v) => {
        v.active = userId;
      }),
  };
}
