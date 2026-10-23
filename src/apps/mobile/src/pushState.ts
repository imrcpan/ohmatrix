import type { AccountStore, Preferences, StoredAccount } from "@ohmatrix/core";
import { inAccountDir, pathOfFileUri } from "./secureStorage.js";

/** What the native push module takes (see modules/ohmatrix-push): one call that replaces everything it knows. */
export interface PushNative {
  setState(json: string): void;
}

/** What the module needs of one account: the session, and where its database is. */
interface PushAccountJson {
  userId: string;
  homeserver: string;
  deviceId: string;
  accessToken: string;
  refreshToken?: string;
  slidingSyncNative: boolean;
  dataDir: string;
  cacheDir: string;
}

/**
 * The json the native push service reads while the app is not running: the accounts with their sessions (the service restores one
 * and fetches the event a push names), the database key, and the settings that decide what it shows. Nothing here is new: it is
 * what the secure storage holds, handed over in the form the Kotlin side can read. With no accounts it is empty, which removes it.
 */
export function pushStateJson(
  accounts: readonly StoredAccount[],
  key: string | null,
  roots: { documents: string; cache: string },
  prefs: Pick<Preferences, "pushEnabled" | "notificationPreview" | "locale">,
): string {
  if (accounts.length === 0 || !key) return "";
  const list: PushAccountJson[] = accounts.map((a) => {
    let extra: { refreshToken?: string; slidingSyncVersion?: unknown } = {};
    try {
      extra = a.session.native ? (JSON.parse(a.session.native) as typeof extra) : {};
    } catch {
      /* a damaged value is the same as none */
    }
    return {
      userId: a.session.userId,
      homeserver: a.session.homeserver,
      deviceId: a.session.deviceId,
      accessToken: a.session.accessToken,
      ...(extra.refreshToken && { refreshToken: extra.refreshToken }),
      // The SDK's enum is 0 (none) or 1 (native) in the session's own record; a session without it was made with native sliding sync.
      slidingSyncNative: extra.slidingSyncVersion === undefined || extra.slidingSyncVersion === 1 || extra.slidingSyncVersion === "Native",
      dataDir: pathOfFileUri(inAccountDir(roots.documents, a.dir)),
      cacheDir: pathOfFileUri(inAccountDir(roots.cache, a.dir)),
    };
  });
  return JSON.stringify({ enabled: prefs.pushEnabled, content: prefs.notificationPreview, lang: prefs.locale ?? "", key, accounts: list });
}

/**
 * Keeps the native copy up to date: after every change of the accounts (and when the settings change), the whole state is handed
 * over again. It is a small value, and one call that replaces everything cannot leave a half-changed copy behind.
 */
export function createPushSync(native: PushNative, accounts: AccountStore, key: () => Promise<string | null>, roots: { documents: string; cache: string }) {
  let queue: Promise<unknown> = Promise.resolve();
  let prefs: Pick<Preferences, "pushEnabled" | "notificationPreview" | "locale"> = { pushEnabled: true, notificationPreview: true, locale: null };
  const run = () =>
    (queue = queue.then(async () => {
      try {
        native.setState(pushStateJson(await accounts.list(), await key(), roots, prefs));
      } catch {
        // The module is not in this build, or the store could not be read: the service then has nothing, and shows nothing.
      }
    }));
  return {
    /** The accounts changed (one was added, refreshed or removed). */
    refresh: () => run().then(() => undefined),
    /** The settings changed. */
    prefs(p: Pick<Preferences, "pushEnabled" | "notificationPreview" | "locale">) {
      if (p.pushEnabled === prefs.pushEnabled && p.notificationPreview === prefs.notificationPreview && p.locale === prefs.locale) return queue;
      prefs = p;
      return run();
    },
  };
}

/**
 * An AccountStore that waits for `changed` after each write: a write is not done until the native copy has the account, so the service
 * never sees an older list than the app (a push that comes just after signing in still finds the account).
 */
export function notifyingAccountStore(inner: AccountStore, changed: () => Promise<unknown> | void): AccountStore {
  const then = async <T>(p: Promise<T>) => {
    const v = await p;
    await changed();
    return v;
  };
  return {
    list: () => inner.list(),
    upsert: (a) => then(inner.upsert(a)),
    remove: (id) => then(inner.remove(id)),
    reorder: (ids) => then(inner.reorder(ids)),
    activeId: () => inner.activeId(),
    setActive: (id) => inner.setActive(id),
  };
}
