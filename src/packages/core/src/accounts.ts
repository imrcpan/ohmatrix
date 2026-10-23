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

/** Persists every signed-in account, and which one is showing, in platform secure storage. Accounts keep the order they were added in, until the person moves them. */
export interface AccountStore {
  list(): Promise<StoredAccount[]>;
  /** Add the account, or replace the one with the same user id (a refreshed token) without moving it. */
  upsert(account: StoredAccount): Promise<void>;
  remove(userId: UserId): Promise<void>;
  /** Put the accounts in this order. An id that is not stored is left out; an account not named keeps its place after the ones that are. */
  reorder(userIds: UserId[]): Promise<void>;
  activeId(): Promise<UserId | null>;
  setActive(userId: UserId | null): Promise<void>;
}

/**
 * A `SessionStore` for one account, so a controller (which knows nothing about other accounts) can keep using it. With
 * `userId` it restores and signs out that account; without one, it is for an account being added, which is saved under the
 * user id it signs in as (with `dir`, the folder its engine was given) and has nothing to restore.
 */
export function scopedSessionStore(accounts: AccountStore, scope: { userId?: UserId; dir?: string; session?: Session } = {}): SessionStore {
  let userId = scope.userId;
  // The session the caller has just read from the store: handed out by the first `load`, so that it is not read again (a read of all the
  // accounts is one read of secure storage for each of them). A `save` or `clear` makes it stale, so it is dropped then.
  let known = scope.session;
  return {
    async load() {
      if (!userId) return null;
      if (known) {
        const s = known;
        known = undefined;
        return s;
      }
      return (await accounts.list()).find((a) => a.session.userId === userId)?.session ?? null;
    },
    async save(session) {
      known = undefined;
      userId = session.userId;
      await accounts.upsert({ session, ...(scope.dir !== undefined && { dir: scope.dir }) });
    },
    async clear() {
      known = undefined;
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
    async reorder(userIds) {
      items = inOrder(items, userIds, (a) => a.session.userId);
    },
    async activeId() {
      return active;
    },
    async setActive(userId) {
      active = userId;
    },
  };
}

/** `items` with the ones named by `ids` first, in that order (an id nobody has is skipped), and the rest after them as they were. */
export function inOrder<T>(items: T[], ids: string[], idOf: (item: T) => string): T[] {
  const first: T[] = [];
  for (const id of ids) {
    const found = items.find((i) => idOf(i) === id);
    if (found !== undefined && !first.includes(found)) first.push(found);
  }
  return [...first, ...items.filter((i) => !first.includes(i))];
}
