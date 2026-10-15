import type { Session, SessionStore } from "@ohmatrix/core";

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
