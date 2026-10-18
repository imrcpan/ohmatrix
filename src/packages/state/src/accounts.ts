import { createStore, type StoreApi } from "zustand/vanilla";
import {
  adoptSingleSession,
  EngineError,
  scopedSessionStore,
  type AccountStore,
  type IncomingNotification,
  type MatrixEngine,
  type MxcUri,
  type PlatformServices,
  type Preferences,
  type SessionStore,
  type UserId,
} from "@ohmatrix/core";
import { createAppController, totalUnread, type AppController, type AppState } from "./index.js";

/** What the account list needs to show about one signed-in account. */
export interface AccountSummary {
  userId: UserId;
  homeserver: string;
  displayName?: string | undefined;
  avatar?: MxcUri | undefined;
  /** The unread badge of this account's chats (see `totalUnread`). */
  unread: number;
}

export interface AccountsState {
  /** Every account, in the order they were added. */
  accounts: AccountSummary[];
  /** What is showing: an account's user id, or `NEW_ACCOUNT` while one is being signed in. Changes whenever the controller to use does. */
  currentKey: string;
  /** The sign-in screen for a new account is showing (and, with accounts present, can be cancelled). */
  adding: boolean;
  /** `start()` has finished: there is a controller to use. */
  ready: boolean;
}

/** `currentKey` while a new account is being signed in. */
export const NEW_ACCOUNT = "new";

export interface AccountManagerDeps {
  accounts: AccountStore;
  /** Where the one session from before there were several lives, if the platform has such a store: it is adopted as the first account. */
  legacySessions?: SessionStore;
  /** Everything but the session store, which each account gets its own scoped one of. */
  services: Omit<PlatformServices, "sessionStore">;
  /** An engine for one account. `dir` is the folder it keeps its data in (see `StoredAccount.dir`); absent = the engine's default. */
  makeEngine(dir: string | undefined): MatrixEngine;
  /** A folder name for an account about to be added, which no other account uses. Absent = accounts have no folder of their own. */
  newDir?(): string;
  /**
   * An account has gone (signed out, or its session died), or a sign-in that was begun was dropped (`userId` null): delete what
   * it left on the device.
   */
  forget?(account: { userId: UserId | null; dir?: string | undefined }): Promise<void>;
}

/**
 * Several accounts at once, one `AppController` each (arch-design: "多账号 = 多个 controller + 上层 AccountManager"). Every
 * account keeps syncing, so the account list can show unread badges and any account can raise a notification. Exactly one
 * controller is `current()`: the shown account's, or the one a new account is being signed in with.
 */
export interface AccountManager {
  store: StoreApi<AccountsState>;
  /** Load the saved accounts and start them all. Call once at startup, before `current()`. */
  start(): Promise<void>;
  /** The controller to show: the active account's, or the new-account sign-in's. */
  current(): AppController;
  controllerOf(userId: UserId): AppController | undefined;
  switchTo(userId: UserId): void;
  /** Show the sign-in screen for one more account. */
  beginAdd(): void;
  /** Go back from that screen to the account that was showing. No effect when there is no account yet. */
  cancelAdd(): void;
  /** Sign an account out (on the server too) and forget it; the next account, or the sign-in screen, takes over. */
  remove(userId: UserId): Promise<void>;
  /** A new message in any account that should notify; `userId` says which one. */
  subscribeNotifications(cb: (userId: UserId, n: IncomingNotification) => void): () => void;
  dispose(): void;
}

interface Entry {
  controller: AppController;
  dir: string | undefined;
  stop: Array<() => void>;
}

export function createAccountManager(deps: AccountManagerDeps): AccountManager {
  const store = createStore<AccountsState>(() => ({ accounts: [], currentKey: NEW_ACCOUNT, adding: false, ready: false }));
  const set = store.setState;
  const entries = new Map<UserId, Entry>();
  let pending: Entry | null = null; // the sign-in of a new account
  const listeners = new Set<(userId: UserId, n: IncomingNotification) => void>();
  let sharedPrefs = "";
  let returnTo: UserId | null = null; // the account that was showing when a new one was begun

  const update = (userId: UserId, patch: Partial<AccountSummary>) =>
    set((s) => ({ accounts: s.accounts.map((a) => (a.userId === userId ? { ...a, ...patch } : a)) }));

  /** A controller with its own scoped session store; `userId` is known for a saved account, not for one being added. */
  const build = (userId: UserId | undefined, dir: string | undefined): Entry => {
    const scoped = scopedSessionStore(deps.accounts, { ...(userId && { userId }), ...(dir !== undefined && { dir }) });
    const engine = deps.makeEngine(dir);
    const sessionStore: SessionStore = userId
      ? scoped
      : {
          ...scoped,
          // Signing in as an account that is already there would replace its session with a new device's: refuse before saving.
          async save(session) {
            if (entries.has(session.userId)) {
              await engine.auth.logout().catch(() => {}); // the server made a device for this sign-in: do not leave it behind
              throw new EngineError("conflict", "This account is already added.");
            }
            await scoped.save(session);
          },
        };
    const controller = createAppController(engine, { ...deps.services, sessionStore });
    return { controller, dir, stop: [] };
  };

  /** What the manager follows in one controller, whether it is a saved account or a sign-in that may become one. */
  const watch = (e: Entry, who: () => UserId | null) => {
    e.stop.push(
      e.controller.subscribeNotifications((n) => {
        const userId = who();
        if (userId) listeners.forEach((l) => l(userId, n));
      }),
    );
    e.stop.push(
      e.controller.store.subscribe((s, prev) => {
        const userId = who();
        if (s.prefs !== prev.prefs) {
          // Preferences belong to the device, not the account: the others follow whichever controller changed them.
          const json = JSON.stringify(s.prefs);
          if (json !== sharedPrefs) {
            sharedPrefs = json;
            for (const other of [...entries.values(), ...(pending ? [pending] : [])])
              if (other !== e) other.controller.store.setState({ prefs: s.prefs as Preferences });
          }
        }
        if (!userId) return;
        if (s.rooms !== prev.rooms) {
          const unread = totalUnread(s.rooms);
          if (store.getState().accounts.find((a) => a.userId === userId)?.unread !== unread) update(userId, { unread });
        }
        if (s.profile !== prev.profile && s.profile) update(userId, { displayName: s.profile.displayName, avatar: s.profile.avatar });
        if (s.auth === "signedOut" && prev.auth !== "signedOut") void endedIfCleared(userId);
      }),
    );
  };

  const stopEntry = (e: Entry) => {
    for (const off of e.stop.splice(0)) off();
    e.controller.dispose();
  };

  /** Puts a message on a sign-in screen once it has started (it clears the message while it starts up). */
  const carryNotice = (e: Entry, notice: { authError: string | null; authErrorCode: AppState["authErrorCode"] }) => {
    const apply = () => e.controller.store.setState(notice);
    if (e.controller.store.getState().auth === "signedOut") return apply();
    const stop = e.controller.store.subscribe((s) => {
      if (s.auth !== "signedOut") return;
      stop();
      apply();
    });
    e.stop.push(stop);
  };

  /** The sign-in of a new account, made if there is none. Returns the state change that shows it, for the caller to apply with its own. */
  const preparePending = (): Pick<AccountsState, "currentKey" | "adding"> => {
    pending ??= (() => {
      const e = build(undefined, deps.newDir?.());
      watch(e, () => null);
      // It becomes an account the moment it is signed in.
      e.stop.push(
        e.controller.store.subscribe((s, prev) => {
          if (s.auth !== "signedIn" || prev.auth === "signedIn" || !s.userId) return;
          if (pending !== e) return;
          void promote(e, s.userId, s.homeserver ?? "");
        }),
      );
      void e.controller.bootstrap();
      return e;
    })();
    const showing = store.getState().currentKey;
    if (showing !== NEW_ACCOUNT) returnTo = showing;
    return { currentKey: NEW_ACCOUNT, adding: true };
  };
  const showPending = () => set(preparePending());

  /** Drop a sign-in that was begun and not finished, with the folder it was given. One that is signing in is left to finish: it would still save its account. */
  const discardPending = (): boolean => {
    const p = pending;
    if (!p) return true;
    if (p.controller.store.getState().auth === "signingIn") return false;
    pending = null;
    stopEntry(p);
    void deps.forget?.({ userId: null, dir: p.dir }).catch(() => {});
    return true;
  };

  const promote = async (e: Entry, userId: UserId, homeserver: string) => {
    pending = null;
    for (const off of e.stop.splice(0)) off();
    entries.set(userId, e);
    watch(e, () => userId);
    const profile = e.controller.store.getState().profile;
    set((s) => ({
      accounts: [
        ...s.accounts,
        { userId, homeserver, displayName: profile?.displayName, avatar: profile?.avatar, unread: totalUnread(e.controller.store.getState().rooms) },
      ],
      // Only when the sign-in is what is showing: someone who has gone to another account meanwhile is not pulled back.
      ...(s.currentKey === NEW_ACCOUNT ? { currentKey: userId, adding: false } : {}),
    }));
    if (store.getState().currentKey === userId) await deps.accounts.setActive(userId);
  };

  /**
   * A controller went signed out. That is the end of the account only when it also cleared its session (a sign-out, or the
   * server refusing the token). A start that failed for another reason (no network, a store that would not open) leaves the
   * session saved: the account stays, showing its sign-in screen with the error, and is tried again on the next start.
   */
  const endedIfCleared = async (userId: UserId) => {
    if ((await deps.accounts.list()).some((a) => a.session.userId === userId)) return;
    await gone(userId);
  };

  /** An account is gone: signed out here, or the server ended its session. Forget it and show the next. */
  const goneJobs = new Map<UserId, Promise<void>>();
  const gone = (userId: UserId): Promise<void> => {
    // Asked for twice (by the sign-out and by the watcher that sees it): both wait for the one job, which ends when the next screen is set.
    const running = goneJobs.get(userId);
    if (running) return running;
    const job = dropAccount(userId).finally(() => goneJobs.delete(userId));
    goneJobs.set(userId, job);
    return job;
  };
  const dropAccount = async (userId: UserId) => {
    const e = entries.get(userId);
    if (!e) return;
    entries.delete(userId);
    stopEntry(e);
    // The screen is settled first, in one go: with `currentKey` left pointing at an account that is gone, a redraw would find nothing to show.
    const before = store.getState();
    const at = before.accounts.findIndex((a) => a.userId === userId);
    const rest = before.accounts.filter((a) => a.userId !== userId);
    const next = rest[Math.min(at, rest.length - 1)];
    const { authError, authErrorCode } = e.controller.store.getState();
    set({
      accounts: rest,
      ...(before.currentKey === userId ? (next ? { currentKey: next.userId, adding: false } : preparePending()) : {}),
    });
    // The last account has ended with a reason (the keys of this device are lost, the server refused the session): the sign-in screen
    // that takes its place says so, instead of showing up as if nothing had happened.
    if (!next && authError && pending) carryNotice(pending, { authError, authErrorCode });
    await deps.accounts.remove(userId); // already done by the controller's own sign-out, harmless again
    await deps.forget?.({ userId, dir: e.dir }).catch(() => {});
    if (before.currentKey === userId) await deps.accounts.setActive(next?.userId ?? null);
  };

  const manager: AccountManager = {
    store,
    async start() {
      if (deps.legacySessions) await adoptSingleSession(deps.legacySessions, deps.accounts);
      const saved = await deps.accounts.list();
      const active = await deps.accounts.activeId();
      for (const a of saved) {
        const e = build(a.session.userId, a.dir);
        entries.set(a.session.userId, e);
        set((s) => ({ accounts: [...s.accounts, { userId: a.session.userId, homeserver: a.session.homeserver, unread: 0 }] }));
        watch(e, () => a.session.userId);
      }
      const first = saved.find((a) => a.session.userId === active) ?? saved[0];
      if (first) set({ currentKey: first.session.userId, adding: false });
      else showPending();
      set({ ready: true });
      // They start together; a slow or offline server of one must not hold the others (or the first screen) back.
      for (const e of entries.values()) void e.controller.bootstrap();
    },
    current() {
      const { currentKey } = store.getState();
      const e = currentKey === NEW_ACCOUNT ? pending : entries.get(currentKey);
      if (!e) throw new Error("current() before start(), or with nothing to show");
      return e.controller;
    },
    controllerOf: (userId) => entries.get(userId)?.controller,
    switchTo(userId) {
      if (!entries.has(userId)) return;
      if (store.getState().accounts.length > 0) discardPending();
      set({ currentKey: userId, adding: false });
      void deps.accounts.setActive(userId);
    },
    beginAdd: showPending,
    cancelAdd() {
      const { accounts, currentKey } = store.getState();
      if (accounts.length === 0 || currentKey !== NEW_ACCOUNT) return;
      if (!discardPending()) return; // signing in: let it finish
      const back = accounts.find((a) => a.userId === returnTo) ?? accounts[0]!;
      set({ currentKey: back.userId, adding: false });
    },
    async remove(userId) {
      const e = entries.get(userId);
      if (!e) return;
      await e.controller.logout().catch(() => {}); // clears the session; the watcher then forgets the account
      await gone(userId);
    },
    subscribeNotifications(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    dispose() {
      for (const e of [...entries.values(), ...(pending ? [pending] : [])]) stopEntry(e);
      entries.clear();
      pending = null;
      listeners.clear();
    },
  };
  return manager;
}
