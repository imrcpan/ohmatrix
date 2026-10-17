import type { AccountStore, Session, SessionStore, StoredAccount, UserId } from "@ohmatrix/core";

/** The part of `expo-secure-store` we use: Android Keystore-backed on Android, Keychain on iOS. */
export interface SecureKeyValue {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const SESSION_KEY = "ohmatrix.session.v1";
const DB_PASSPHRASE_KEY = "ohmatrix.db-passphrase.v1";

/**
 * Session persistence in the platform's secure storage. A value that cannot be read back (damaged, or written by a
 * version we do not know) is dropped and counts as no session, the way the web store treats it.
 */
export function createSessionStore(kv: SecureKeyValue): SessionStore {
  return {
    async load() {
      let raw: string | null;
      try {
        raw = await kv.getItemAsync(SESSION_KEY);
      } catch {
        return null; // the keystore cannot be opened: sign in again
      }
      if (!raw) return null;
      try {
        const s = JSON.parse(raw) as Partial<Session>;
        if (!s || typeof s.accessToken !== "string" || typeof s.userId !== "string" || typeof s.deviceId !== "string" || typeof s.homeserver !== "string")
          throw new Error("not a session");
        return s as Session;
      } catch {
        await kv.deleteItemAsync(SESSION_KEY).catch(() => {});
        return null;
      }
    },
    save: (s) => kv.setItemAsync(SESSION_KEY, JSON.stringify(s)),
    clear: () => kv.deleteItemAsync(SESSION_KEY),
  };
}

/**
 * The passphrase of the SDK's local database (its cache and its encryption keys). It is made once, from `random`
 * (32 bytes), kept in the secure storage, and has to be the same every time or the database cannot be opened.
 */
export async function databasePassphrase(kv: SecureKeyValue, random: (n: number) => Uint8Array): Promise<string> {
  const have = await kv.getItemAsync(DB_PASSPHRASE_KEY);
  if (have) return have;
  const made = [...random(32)].map((b) => b.toString(16).padStart(2, "0")).join("");
  await kv.setItemAsync(DB_PASSPHRASE_KEY, made);
  return made;
}

/** Forget the database passphrase: done together with the database itself, when the account is signed out. */
export function forgetDatabasePassphrase(kv: SecureKeyValue): Promise<void> {
  return kv.deleteItemAsync(DB_PASSPHRASE_KEY);
}

/**
 * A folder as the path the SDK's database needs. expo-file-system hands out `file://` URIs (percent-encoded); Rust opens
 * plain paths. No trailing slash.
 */
export function pathOfFileUri(uri: string): string {
  const path = uri.replace(/^file:\/\//, "");
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    /* not encoded after all */
  }
  return decoded.length > 1 ? decoded.replace(/\/+$/, "") : decoded;
}

const ACCOUNTS_KEY = "ohmatrix.accounts.v1"; // which accounts there are, and which one is showing
const ACCOUNT_KEY = "ohmatrix.account.v1."; // one account, by user id

/** The Keystore accepts letters, digits, `.`, `-` and `_` in a key; a user id (`@a:server`) has more, so those are written as `_xx`. */
const keyOf = (userId: UserId) => ACCOUNT_KEY + userId.replace(/[^A-Za-z0-9.-]/g, (c) => `_${c.charCodeAt(0).toString(16).padStart(2, "0")}`);

const validSession = (s: Partial<Session> | null | undefined): s is Session =>
  !!s && typeof s.accessToken === "string" && typeof s.userId === "string" && typeof s.deviceId === "string" && typeof s.homeserver === "string";

/**
 * Every signed-in account, each under its own key (the secure storage limits how much one value may hold, and a session is
 * not small), plus an index of the user ids in the order they were added and the one that is showing. An account that cannot
 * be read back is left out of the list and removed.
 */
export function createAccountStore(kv: SecureKeyValue): AccountStore {
  interface Index {
    ids: UserId[];
    active: UserId | null;
  }
  const readIndex = async (): Promise<Index> => {
    try {
      const v = JSON.parse((await kv.getItemAsync(ACCOUNTS_KEY)) ?? "null") as Partial<Index> | null;
      return { ids: Array.isArray(v?.ids) ? v.ids.filter((i) => typeof i === "string") : [], active: typeof v?.active === "string" ? v.active : null };
    } catch {
      return { ids: [], active: null };
    }
  };
  const writeIndex = (i: Index) => kv.setItemAsync(ACCOUNTS_KEY, JSON.stringify(i));
  // One change at a time: the index is read, changed and written back.
  let queue: Promise<unknown> = Promise.resolve();
  const change = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn);
    queue = run.catch(() => {});
    return run;
  };
  return {
    list: () =>
      change(async () => {
        const index = await readIndex();
        const out: StoredAccount[] = [];
        for (const id of index.ids) {
          try {
            const a = JSON.parse((await kv.getItemAsync(keyOf(id))) ?? "null") as StoredAccount | null;
            if (validSession(a?.session)) out.push(a);
          } catch {
            /* unreadable: dropped below */
          }
        }
        if (out.length !== index.ids.length) {
          const kept = out.map((a) => a.session.userId);
          for (const id of index.ids.filter((i) => !kept.includes(i))) await kv.deleteItemAsync(keyOf(id)).catch(() => {});
          await writeIndex({ ids: kept, active: kept.includes(index.active ?? "") ? index.active : null });
        }
        return out;
      }),
    upsert: (account) =>
      change(async () => {
        const index = await readIndex();
        await kv.setItemAsync(keyOf(account.session.userId), JSON.stringify(account));
        if (!index.ids.includes(account.session.userId)) await writeIndex({ ...index, ids: [...index.ids, account.session.userId] });
      }),
    remove: (userId) =>
      change(async () => {
        const index = await readIndex();
        await kv.deleteItemAsync(keyOf(userId));
        await writeIndex({ ids: index.ids.filter((i) => i !== userId), active: index.active === userId ? null : index.active });
      }),
    activeId: () => change(async () => (await readIndex()).active),
    setActive: (userId) => change(async () => writeIndex({ ...(await readIndex()), active: userId })),
  };
}

/** Where an account keeps its data: its own folder inside `root`, or `root` itself for the account that was there first (`dir` absent). */
export const inAccountDir = (root: string, dir: string | undefined): string => (dir ? `${root.replace(/\/$/, "")}/${dir}` : root);
