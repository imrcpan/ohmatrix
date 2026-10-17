import type { Session, UserId } from "./types.js";
import type { SessionStore } from "./platform.js";

/** One signed-in account as the platform keeps it. */
export interface StoredAccount {
  session: Session;
  /**
   * Where the engine keeps this account's local data, relative to the app's data folder (a phone's SQLite database). Absent for
   * the account that was there before there were several: its data stays in the folder itself.
   */
  dir?: string;
}

/** Persists every signed-in account, and which one is showing, in platform secure storage. Accounts keep the order they were added in. */
export interface AccountStore {
  list(): Promise<StoredAccount[]>;
  /** Add the account, or replace the one with the same user id (a refreshed token) without moving it. */
  upsert(account: StoredAccount): Promise<void>;
  remove(userId: UserId): Promise<void>;
  activeId(): Promise<UserId | null>;
  setActive(userId: UserId | null): Promise<void>;
}

/**
 * A `SessionStore` for one account, so a controller (which knows nothing about other accounts) can keep using it. With
 * `userId` it restores and signs out that account; without one, it is for an account being added, which is saved under the
 * user id it signs in as (with `dir`, the folder its engine was given) and has nothing to restore.
 */
export function scopedSessionStore(accounts: AccountStore, scope: { userId?: UserId; dir?: string } = {}): SessionStore {
  let userId = scope.userId;
  return {
    async load() {
      if (!userId) return null;
      return (await accounts.list()).find((a) => a.session.userId === userId)?.session ?? null;
    },
    async save(session) {
      userId = session.userId;
      await accounts.upsert({ session, ...(scope.dir !== undefined && { dir: scope.dir }) });
    },
    async clear() {
      if (userId) await accounts.remove(userId);
    },
  };
}

/**
 * A single-session store's session becomes the first account, and the old copy is deleted. It has to go: with it kept, signing
 * out of every account would bring it back as an account on the next start. Nothing happens when accounts already exist.
 */
export async function adoptSingleSession(old: SessionStore, accounts: AccountStore): Promise<void> {
  if ((await accounts.list()).length > 0) return;
  const session = await old.load();
  if (!session) return;
  await accounts.upsert({ session });
  await accounts.setActive(session.userId);
  await old.clear();
}

/** An `AccountStore` that lives in memory: for tests, and for a platform without secure storage. */
export function createMemoryAccountStore(initial: StoredAccount[] = []): AccountStore {
  let items = [...initial];
  let active: UserId | null = items[0]?.session.userId ?? null;
  return {
    async list() {
      return items.map((a) => ({ ...a }));
    },
    async upsert(account) {
      const at = items.findIndex((a) => a.session.userId === account.session.userId);
      items = at < 0 ? [...items, { ...account }] : items.map((a, i) => (i === at ? { ...account } : a));
    },
    async remove(userId) {
      items = items.filter((a) => a.session.userId !== userId);
      if (active === userId) active = null;
    },
    async activeId() {
      return active;
    },
    async setActive(userId) {
      active = userId;
    },
  };
}
