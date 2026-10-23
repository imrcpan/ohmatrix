import { inOrder, type AccountStore, type Session, type SessionStore, type StoredAccount, type UserId } from "@ohmatrix/core";

/** The part of `expo-secure-store` we use: Android Keystore-backed on Android, Keychain on iOS. */
export interface SecureKeyValue {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

const SESSION_KEY = "ohmatrix.session.v1";
/** Where the database key is kept (`v2`: the key of a database that is opened with a key; the passphrase of `v1` opened an older kind). */
const DB_KEY_KEY = "ohmatrix.db-key.v2";
/** The kind of local database this version makes. An app that finds another kind (or none) starts with no accounts and no old databases. */
export const STORE_FORMAT_KEY = "ohmatrix.store-format";
export const STORE_FORMAT = "2";
export const OLD_DB_PASSPHRASE_KEY = "ohmatrix.db-passphrase.v1";

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
 * The key of the SDK's local database (its cache and its encryption keys): 32 random bytes, made once from `random`, kept in the secure
 * storage as 64 hex digits, and the same every time or the database cannot be opened. It is a key and not a passphrase: it is random,
 * so the SDK has nothing to stretch, and a passphrase would be run through 200,000 rounds of key derivation at every opening of every
 * store (a second or more for each account, at every start of the app).
 */
export async function databaseKey(kv: SecureKeyValue, random: (n: number) => Uint8Array): Promise<ArrayBuffer> {
  const have = await kv.getItemAsync(DB_KEY_KEY);
  const hex = have && /^[0-9a-f]{64}$/.test(have) ? have : await makeKey(kv, random);
  return bytesOfHex(hex);
}

async function makeKey(kv: SecureKeyValue, random: (n: number) => Uint8Array): Promise<string> {
  const made = [...random(32)].map((b) => b.toString(16).padStart(2, "0")).join("");
  await kv.setItemAsync(DB_KEY_KEY, made);
  return made;
}

/** The 32 bytes of a key written as 64 hex digits. */
export function bytesOfHex(hex: string): ArrayBuffer {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out.buffer;
}

/** Forget the database key: done together with the database itself, when the account is signed out. */
export function forgetDatabaseKey(kv: SecureKeyValue): Promise<void> {
  return kv.deleteItemAsync(DB_KEY_KEY);
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
    reorder: (userIds) =>
      change(async () => {
        const index = await readIndex();
        await writeIndex({ ...index, ids: inOrder(index.ids, userIds, (i) => i) });
      }),
    activeId: () => change(async () => (await readIndex()).active),
    setActive: (userId) => change(async () => writeIndex({ ...(await readIndex()), active: userId })),
  };
}

/** Where an account keeps its data: its own folder inside `root`, or `root` itself for the account that was there first (`dir` absent). */
export const inAccountDir = (root: string, dir: string | undefined): string => (dir ? `${root.replace(/\/$/, "")}/${dir}` : root);
