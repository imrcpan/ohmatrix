import {
  ClientEvent,
  createClient,
  Direction,
  IndexedDBStore,
  PendingEventOrdering,
  MatrixError,
  MemoryStore,
  MatrixEventEvent,
  RoomEvent,
  SyncState as SdkSync,
  EventType,
  RelationType,
  RoomMemberEvent,
  RoomStateEvent,
  type MatrixClient,
  type MatrixEvent,
  type Room,
} from "matrix-js-sdk";
import {
  EngineError,
  type AttachmentSource,
  type EngineErrorCode,
  type MediaOptions,
  type Profile,
  type UserSuggestion,
  type RoomDetails,
  type RoomMember,
  type Listener,
  type ListUpdate,
  type MatrixEngine,
  type RoomId,
  type RoomSummary,
  type Session,
  type SyncState,
  type TimelineHandle,
  type TimelineItem,
} from "@ohmatrix/core";
import { nameOf, roomItems, toRoomSummary, typingNames } from "./convert.js";
import { decryptAttachment, encryptAttachment, type EncryptedFile } from "./attachments.js";
import { diffTimeline } from "./diff.js";
import { JsSecurity, SecretKeyCache } from "./security.js";

function wrap(e: unknown): EngineError {
  if (e instanceof EngineError) return e;
  let code: EngineErrorCode = "unknown";
  if (e instanceof MatrixError) {
    code =
      e.errcode === "M_UNKNOWN_TOKEN"
        ? "unauthorized"
        : e.errcode === "M_FORBIDDEN"
          ? "forbidden"
          : e.errcode === "M_LIMIT_EXCEEDED"
            ? "rate_limited"
            : e.errcode === "M_NOT_FOUND"
              ? "not_found"
              : "unknown";
  } else if (e instanceof TypeError || (e as Error)?.name === "ConnectionError") code = "network";
  return new EngineError(code, e instanceof Error ? e.message : String(e), e);
}

async function guard<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    throw wrap(e);
  }
}

/** Resolves once sync has delivered the room as joined, so callers can safely open it right away. */
function waitForJoinedRoom(c: MatrixClient, roomId: string, timeoutMs = 20000): Promise<void> {
  const ready = () => c.getRoom(roomId)?.getMyMembership() === "join";
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = (err?: Error) => {
      clearTimeout(timer);
      c.off(ClientEvent.Room, check);
      c.off(RoomEvent.MyMembership, check as never);
      if (err) reject(err);
      else resolve();
    };
    const check = () => {
      if (ready()) done();
    };
    const timer = setTimeout(() => done(new EngineError("network", "Timed out waiting for the room to sync")), timeoutMs);
    c.on(ClientEvent.Room, check);
    c.on(RoomEvent.MyMembership, check as never);
    check();
  });
}

/** Short stable id of a key, used in store names (never reveals the key). */
async function keyFingerprint(key: Uint8Array<ArrayBuffer>): Promise<string> {
  const d = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", key));
  return [...d.slice(0, 4)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** One crypto store per user *and device*, so a new login can never collide with an old device's keys. */
const syncDbName = (s: Session) => `${cryptoBase(s)}-sync`;
const cryptoBase = (s: Session) => `ohmatrix-${s.userId}-${s.deviceId}`;

/** The sync cache of a device (IndexedDBStore names its database `matrix-js-sdk:<dbName>`). */
function deleteSyncCache(base: string): Promise<void> {
  const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!idb) return Promise.resolve();
  return new Promise((resolve) => {
    const r = idb.deleteDatabase(`matrix-js-sdk:${base}-sync`);
    r.onsuccess = r.onerror = r.onblocked = () => resolve();
  });
}

async function deleteCryptoStores(prefix: string, keep?: string): Promise<void> {
  const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!idb) return;
  const names =
    (await idb.databases?.())
      ?.map((d) => d.name)
      .filter((n): n is string => !!n && (n.startsWith(`${prefix}::`) || n.startsWith(`${prefix}-`)) && !(keep && n.startsWith(`${keep}::`))) ?? [];
  await Promise.all(
    names.map(
      (n) =>
        new Promise<void>((resolve) => {
          const req = idb.deleteDatabase(n);
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        }),
    ),
  );
}

const normalize = (hs: string) => (/^https?:\/\//.test(hs) ? hs : `https://${hs}`).replace(/\/+$/, "");

export interface JsSdkEngineOptions {
  /** Where the Rust crypto store lives. "memory" is for tests/Node; browsers should use IndexedDB. */
  cryptoStorage?: "indexeddb" | "memory";
  /**
   * Encrypts the IndexedDB crypto store at rest. `get` returns the 32-byte key for a store (creating
   * it on first use); `remove` forgets it when the store is deleted. Without a provider the store is
   * written unencrypted.
   */
  storageKey?: StorageKeyProvider;
}

export interface StorageKeyProvider {
  get(storeId: string): Promise<Uint8Array<ArrayBuffer>>;
  remove(storeId: string): Promise<void>;
}

/** matrix-js-sdk engine for web/desktop with Rust (WASM) end-to-end encryption. */
export class JsSdkEngine implements MatrixEngine {
  private secretKeys = new SecretKeyCache();
  private cryptoPrefix: string | null = null;
  private security_ = new JsSecurity(() => this.client, this.secretKeys);

  constructor(private options: JsSdkEngineOptions = {}) {}

  readonly security = this.security_;

  private client: MatrixClient | null = null;
  private syncListeners = new Set<Listener<SyncState>>();
  private roomListeners = new Set<Listener<ListUpdate<RoomSummary>[]>>();
  private roomEmitPending = false;
  private lastSync: SyncState = "stopped";

  private requireClient(): MatrixClient {
    if (!this.client) throw new EngineError("unauthorized", "not logged in");
    return this.client;
  }

  private attach(client: MatrixClient) {
    this.client = client;
    const schedule = () => this.scheduleRoomEmit();
    client.on(ClientEvent.Sync, (state) => {
      this.setSync(
        state === SdkSync.Error
          ? "error"
          : state === SdkSync.Stopped
            ? "stopped"
            : state === SdkSync.Prepared || state === SdkSync.Syncing
              ? "syncing"
              : "connecting",
      );
      if (state === SdkSync.Prepared || state === SdkSync.Syncing) {
        schedule();
        void this.security_.refresh();
        if (!this.lastProfile) void this.refreshProfile();
      }
    });
    client.on(MatrixEventEvent.Decrypted, schedule);
    client.on(MatrixEventEvent.Replaced, schedule as never);
    client.on(RoomEvent.Redaction, schedule as never);
    client.on(ClientEvent.Room, schedule);
    client.on(ClientEvent.DeleteRoom, schedule);
    client.on(ClientEvent.AccountData, schedule);
    client.on(RoomEvent.Timeline, schedule);
    client.on(RoomEvent.Name, schedule);
    client.on(RoomEvent.Receipt, schedule);
    client.on(RoomMemberEvent.Typing as never, schedule as never);
    client.on(RoomEvent.Tags, schedule);
    client.on(RoomEvent.AccountData, schedule);
    client.on(RoomEvent.UnreadNotifications as never, schedule as never);
    client.on(RoomEvent.MyMembership, schedule);
    client.on(RoomEvent.LocalEchoUpdated, schedule);
  }

  private releaseMedia() {
    for (const p of this.mediaCache.values())
      void p.then(
        (u) => URL.revokeObjectURL(u),
        () => {},
      );
    this.mediaCache.clear();
  }

  private profileListeners = new Set<Listener<Profile | null>>();
  private lastProfile: Profile | null = null;

  private emitProfile(p: Profile | null) {
    this.lastProfile = p;
    this.profileListeners.forEach((cb) => cb(p));
  }

  private async refreshProfile(): Promise<void> {
    const c = this.client;
    const id = c?.getUserId();
    if (!c || !id) return this.emitProfile(null);
    try {
      const info = await c.getProfileInfo(id);
      this.emitProfile({
        userId: id,
        displayName: info.displayname || id.replace(/^@/, "").replace(/:.*$/, ""),
        ...(info.avatar_url && { avatar: info.avatar_url }),
      });
    } catch {
      /* keep the previous value */
    }
  }

  readonly profile = {
    subscribe: (cb: Listener<Profile | null>) => {
      this.profileListeners.add(cb);
      cb(this.lastProfile);
      return () => {
        this.profileListeners.delete(cb);
      };
    },
    setDisplayName: (name: string) =>
      guard(async () => {
        await this.requireClient().setDisplayName(name);
        await this.refreshProfile();
      }),
    setAvatar: (file: AttachmentSource) =>
      guard(async () => {
        const c = this.requireClient();
        const up = await c.uploadContent(file.data as Blob, { name: file.name, type: file.mimeType });
        await c.setAvatarUrl(up.content_uri);
        await this.refreshProfile();
      }),
  };

  readonly users = {
    search: (term: string) =>
      guard(async (): Promise<UserSuggestion[]> => {
        const c = this.requireClient();
        const t = term.trim();
        if (!t) return [];
        const me = c.getUserId();
        const res = await c.searchUserDirectory({ term: t, limit: 20 });
        const out: UserSuggestion[] = res.results
          .filter((r) => r.user_id !== me)
          .map((r) => ({
            userId: r.user_id,
            displayName: r.display_name || r.user_id.replace(/^@/, "").replace(/:.*$/, ""),
            ...(r.avatar_url && { avatar: r.avatar_url }),
          }));
        if (/^@[^:\s]+:\S+$/.test(t) && t !== me && !out.some((u) => u.userId === t)) {
          try {
            const p = await c.getProfileInfo(t);
            out.unshift({ userId: t, displayName: p.displayname || t.replace(/^@/, "").replace(/:.*$/, ""), ...(p.avatar_url && { avatar: p.avatar_url }) });
          } catch {
            /* no such user: not listed */
          }
        }
        return out;
      }),
  };

  /**
   * Creates the client with its sync cache: rooms and recent events kept in IndexedDB, so a reload shows the chat
   * list at once and only fetches what changed. Falls back to a memory store if IndexedDB is unavailable or the
   * cache cannot be opened. (Events of encrypted rooms are stored as received, i.e. still encrypted.)
   */
  private async createClientWithCache(s: Session): Promise<MatrixClient> {
    const make = (store: MemoryStore) =>
      createClient({
        baseUrl: s.homeserver,
        accessToken: s.accessToken,
        userId: s.userId,
        deviceId: s.deviceId,
        store,
        cryptoCallbacks: this.secretKeys.callbacks,
      });
    const memory = () => new MemoryStore({ localStorage: globalThis.localStorage });
    const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    if (this.options.cryptoStorage === "memory" || !idb) return make(memory());
    const store = new IndexedDBStore({ indexedDB: idb, localStorage: globalThis.localStorage, dbName: syncDbName(s) });
    const client = make(store);
    try {
      await store.startup(); // must come after the store is attached to a client
      return client;
    } catch (e) {
      console.warn("sync cache unusable, starting without it:", e);
      await store.deleteAllData().catch(() => {});
      return make(memory());
    }
  }

  /**
   * Stores of this device left under another name belong to a key we no longer have (or to the unencrypted
   * format of earlier versions). If the current store does not exist either, the device's encryption identity
   * is gone: it cannot be reused, so the user must sign in again (a new device). Otherwise just tidy up.
   */
  private async checkDeviceStores(base: string, prefix: string, keys: StorageKeyProvider | undefined): Promise<void> {
    const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
    const names = ((await idb?.databases?.()) ?? []).map((d) => d.name ?? "").filter((n) => n.startsWith(`${base}::`) || n.startsWith(`${base}-`));
    const stale = names.filter((n) => !n.startsWith(`${prefix}::`));
    if (stale.length === 0) return;
    if (names.some((n) => n.startsWith(`${prefix}::`))) {
      void deleteCryptoStores(base, prefix);
      return;
    }
    void deleteCryptoStores(base);
    void deleteSyncCache(base);
    await keys?.remove(base);
    throw new EngineError("keys_lost", "The encryption keys of this device are unavailable. Please sign in again.");
  }

  private setSync(s: SyncState) {
    this.lastSync = s;
    this.syncListeners.forEach((cb) => cb(s));
  }

  private scheduleRoomEmit() {
    if (this.roomEmitPending) return;
    this.roomEmitPending = true;
    queueMicrotask(() => {
      this.roomEmitPending = false;
      this.emitRooms(this.roomListeners);
    });
  }

  private roomList(): RoomSummary[] {
    const c = this.client;
    if (!c) return [];
    return (
      c
        .getVisibleRooms()
        .filter((r) => ["join", "invite"].includes(r.getMyMembership()))
        .map((r) => toRoomSummary(c, r))
        // Invitations first (like Telegram's pending requests), then pinned chats, then by recent activity.
        .sort((a, b) => Number(!!b.invite) - Number(!!a.invite) || Number(!!b.pinned) - Number(!!a.pinned) || b.lastActivityTs - a.lastActivityTs)
    );
  }

  private emitRooms(targets: Iterable<Listener<ListUpdate<RoomSummary>[]>>) {
    const u: ListUpdate<RoomSummary>[] = [{ op: "reset", items: this.roomList() }];
    for (const cb of targets) cb(u);
  }

  readonly auth = {
    loginWithPassword: (homeserver: string, username: string, password: string) =>
      guard(async (): Promise<Session> => {
        const baseUrl = normalize(homeserver);
        const res = await createClient({ baseUrl }).login("m.login.password", {
          identifier: { type: "m.id.user", user: username },
          password,
          initial_device_display_name: "OhMatrix Web",
        });
        const session: Session = { homeserver: baseUrl, userId: res.user_id, deviceId: res.device_id, accessToken: res.access_token };
        await this.auth.restore(session);
        return session;
      }),
    restore: (s: Session) =>
      guard(async () => {
        await this.sync.stop();
        const client = await this.createClientWithCache(s);
        const base = cryptoBase(s);
        const useIndexedDB = this.options.cryptoStorage !== "memory";
        const keyProvider = useIndexedDB ? this.options.storageKey : undefined;
        const key = keyProvider ? await keyProvider.get(base) : undefined;
        // The store is named after its key, so a different (or lost) key can never collide with an old store.
        const prefix = key ? `${base}-${await keyFingerprint(key)}` : base;
        if (useIndexedDB) await this.checkDeviceStores(base, prefix, keyProvider);
        try {
          await client.initRustCrypto({ useIndexedDB, cryptoDatabasePrefix: prefix, ...(key && { storageKey: key }) });
        } catch (e) {
          if (useIndexedDB && /account in the store doesn't match|store cipher|decrypt|MAC/i.test(String((e as Error)?.message))) {
            void deleteCryptoStores(base);
            await keyProvider?.remove(base);
            throw new EngineError("keys_lost", "The encryption keys of this device are unreadable. Please sign in again.", e);
          }
          throw e;
        }
        this.cryptoPrefix = base;
        this.attach(client);
      }),
    logout: () =>
      guard(async () => {
        const c = this.client;
        if (!c) return;
        c.stopClient();
        try {
          await c.logout(true);
        } catch {
          /* token may already be invalid */
        }
        await c.store.deleteAllData().catch(() => {}); // the cached rooms and events belong to this login
        c.removeAllListeners();
        this.client = null;
        // The device is gone from the server, so its local encryption keys are useless: remove them.
        const prefix = this.cryptoPrefix;
        this.cryptoPrefix = null;
        if (prefix && this.options.cryptoStorage !== "memory") {
          await deleteCryptoStores(prefix);
          await this.options.storageKey?.remove(prefix);
        }
        this.releaseMedia();
        this.security_.reset();
        this.emitProfile(null);
        this.setSync("stopped");
        this.emitRooms(this.roomListeners);
      }),
  };

  readonly sync = {
    start: () =>
      guard(async () => {
        const c = this.requireClient();
        if (this.lastSync === "stopped" && !c.clientRunning) {
          this.setSync("connecting");
          await c.startClient({ initialSyncLimit: 30, lazyLoadMembers: true, pendingEventOrdering: PendingEventOrdering.Detached });
        }
      }),
    stop: async () => {
      this.client?.stopClient();
      this.client?.removeAllListeners();
      this.client = null;
      this.setSync("stopped");
    },
    onState: (cb: Listener<SyncState>) => {
      this.syncListeners.add(cb);
      cb(this.lastSync);
      return () => {
        this.syncListeners.delete(cb);
      };
    },
  };

  private mediaCache = new Map<string, Promise<string>>();

  readonly media = {
    resolve: (mxc: string, o: MediaOptions = {}) => {
      const client = this.requireClient();
      const key = `${mxc}|${o.width ?? ""}x${o.height ?? ""}|${o.fit ?? "scale"}|${o.encryption ? "enc" : ""}`;
      let p = this.mediaCache.get(key);
      if (!p) {
        p = guard(async () => {
          const thumb = !o.encryption && o.width && o.height;
          const url = thumb
            ? client.mxcUrlToHttp(mxc, o.width, o.height, o.fit ?? "scale", false, true, true)
            : client.mxcUrlToHttp(mxc, undefined, undefined, undefined, false, true, true);
          if (!url) throw new EngineError("not_found", `bad mxc ${mxc}`);
          const res = await fetch(url, { headers: { Authorization: `Bearer ${client.getAccessToken()}` } });
          if (!res.ok) throw new EngineError(res.status === 404 ? "not_found" : res.status === 401 ? "unauthorized" : "unknown", `media ${res.status}`);
          if (!o.encryption) return URL.createObjectURL(await res.blob());
          const plain = await decryptAttachment(await res.arrayBuffer(), o.encryption as EncryptedFile);
          return URL.createObjectURL(new Blob([plain], { type: o.mimeType ?? "application/octet-stream" }));
        });
        p.catch(() => this.mediaCache.delete(key));
        this.mediaCache.set(key, p);
      }
      return p;
    },
  };

  readonly rooms = {
    acceptInvite: (roomId: RoomId) =>
      guard(async () => {
        await this.requireClient().joinRoom(roomId);
      }),
    setPinned: (roomId: RoomId, pinned: boolean) =>
      guard(async () => {
        const c = this.requireClient();
        if (pinned) await c.setRoomTag(roomId, "m.favourite", { order: 0.5 });
        else await c.deleteRoomTag(roomId, "m.favourite");
      }),
    setMarkedUnread: (roomId: RoomId, unread: boolean) =>
      guard(async () => {
        await this.requireClient().setRoomAccountData(roomId, "m.marked_unread" as never, { unread } as never);
      }),
    markRead: (roomId: RoomId) =>
      guard(async () => {
        const c = this.requireClient();
        const room = c.getRoom(roomId);
        if (!room) return;
        const events = room.getLiveTimeline().getEvents();
        const last = events[events.length - 1];
        if (last?.getId() && !last.isSending()) await c.sendReadReceipt(last);
        if ((room.getAccountData("m.marked_unread")?.getContent() as { unread?: boolean } | undefined)?.unread) {
          await c.setRoomAccountData(roomId, "m.marked_unread" as never, { unread: false } as never);
        }
      }),
    subscribeDetails: (roomId: RoomId, cb: Listener<RoomDetails>) => {
      const c = this.requireClient();
      const room = c.getRoom(roomId);
      if (!room) throw new EngineError("not_found", `unknown room ${roomId}`);
      let live = true,
        pending = false;
      const build = async () => {
        await room.loadMembersIfNeeded().catch(() => {});
        const members: RoomMember[] = [...room.getMembersWithMembership("join"), ...room.getMembersWithMembership("invite")]
          .map((m) => {
            const avatar = m.getMxcAvatarUrl();
            return {
              userId: m.userId,
              name: nameOf(m, m.userId),
              ...(avatar && { avatar }),
              role: m.powerLevel >= 100 ? "admin" : m.powerLevel >= 50 ? "moderator" : "member",
              ...(m.membership === "invite" && { invited: true }),
            } as RoomMember;
          })
          .sort((a, b) => Number(a.invited ?? false) - Number(b.invited ?? false) || a.name.localeCompare(b.name));
        const topic = room.currentState.getStateEvents("m.room.topic" as never, "")?.getContent().topic as string | undefined;
        const avatar = room.getMxcAvatarUrl() ?? undefined;
        const alias = room.getCanonicalAlias() ?? undefined;
        const summary = toRoomSummary(c, room);
        return {
          id: roomId,
          name: room.name || roomId,
          isDirect: summary.isDirect,
          isEncrypted: c.isRoomEncrypted(roomId),
          members,
          ...(topic && { topic }),
          ...(avatar && { avatar }),
          ...(alias && { alias }),
        } satisfies RoomDetails;
      };
      const refresh = () => {
        if (pending) return;
        pending = true;
        queueMicrotask(() => {
          pending = false;
          void build().then((d) => {
            if (live) cb(d);
          });
        });
      };
      c.on(RoomEvent.Name, refresh as never);
      c.on(RoomStateEvent.Members, refresh as never);
      c.on(RoomStateEvent.Events, refresh as never);
      refresh();
      return () => {
        live = false;
        c.off(RoomEvent.Name, refresh as never);
        c.off(RoomStateEvent.Members, refresh as never);
        c.off(RoomStateEvent.Events, refresh as never);
      };
    },
    leave: (roomId: RoomId) =>
      guard(async () => {
        const c = this.requireClient();
        await c.leave(roomId);
        try {
          await c.forget(roomId);
        } catch {
          /* already gone */
        }
      }),
    createDirect: (userId: string) =>
      guard(async () => {
        const c = this.requireClient();
        if (!/^@[^:\s]+:\S+$/.test(userId)) throw new EngineError("not_found", "Enter a full user id like @name:server");
        const direct = c.getAccountData("m.direct" as never)?.getContent<Record<string, string[]>>() ?? {};
        const existing = (direct[userId] ?? []).find((id) => c.getRoom(id)?.getMyMembership() === "join");
        if (existing) return existing;
        try {
          await c.getProfileInfo(userId);
        } catch {
          throw new EngineError("not_found", `User ${userId} not found`);
        }
        const { room_id } = await c.createRoom({
          is_direct: true,
          invite: [userId],
          preset: "trusted_private_chat" as never,
          initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
        });
        await c.setAccountData("m.direct" as never, { ...direct, [userId]: [...(direct[userId] ?? []), room_id] } as never);
        await waitForJoinedRoom(c, room_id);
        return room_id;
      }),
    createGroup: (o: { name: string; invite: string[] }) =>
      guard(async () => {
        const c = this.requireClient();
        const { room_id } = await c.createRoom({
          name: o.name,
          invite: o.invite,
          preset: "private_chat" as never,
          initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
        });
        await waitForJoinedRoom(c, room_id);
        return room_id;
      }),
    joinRoom: (idOrAlias: string) =>
      guard(async () => {
        const c = this.requireClient();
        const id = (await c.joinRoom(idOrAlias.trim())).roomId;
        await waitForJoinedRoom(c, id);
        return id;
      }),
    declineInvite: (roomId: RoomId) =>
      guard(async () => {
        const c = this.requireClient();
        await c.leave(roomId);
        try {
          await c.forget(roomId);
        } catch {
          /* already gone */
        }
      }),
    subscribe: (cb: Listener<ListUpdate<RoomSummary>[]>) => {
      this.roomListeners.add(cb);
      this.emitRooms([cb]);
      return () => {
        this.roomListeners.delete(cb);
      };
    },
  };

  openTimeline(roomId: RoomId): TimelineHandle {
    const client = this.requireClient();
    const room: Room | null = client.getRoom(roomId);
    if (!room) throw new EngineError("not_found", `unknown room ${roomId}`);
    const listeners = new Set<Listener<ListUpdate<TimelineItem>[]>>();
    let current: TimelineItem[] = roomItems(client, room);
    let pending = false;

    const refresh = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        const next = roomItems(client, room);
        const updates = diffTimeline(current, next);
        current = next;
        if (updates.length) listeners.forEach((cb) => cb(updates));
      });
    };
    const onEvent = (_ev: MatrixEvent, r?: Room | undefined) => {
      if (!r || r.roomId === roomId) refresh();
    };
    const onReceipt = (_ev: MatrixEvent, r?: Room) => {
      if (r?.roomId === roomId) refresh();
    };
    const onDecrypted = (ev: MatrixEvent) => {
      if (ev.getRoomId() === roomId) refresh();
    };
    client.on(MatrixEventEvent.Decrypted, onDecrypted);
    client.on(RoomEvent.Receipt, onReceipt as never);
    client.on(MatrixEventEvent.Replaced, refresh as never);
    client.on(RoomEvent.Timeline, onEvent as never);
    client.on(RoomEvent.LocalEchoUpdated, onEvent as never);
    client.on(RoomEvent.Redaction, onEvent as never);

    let typingOn = false,
      typingSentAt = 0;
    let typingTimer: ReturnType<typeof setTimeout> | undefined;
    const typingListeners = new Set<Listener<string[]>>();
    const stopTyping = () => {
      clearTimeout(typingTimer);
      if (typingOn) {
        typingOn = false;
        void client.sendTyping(roomId, false, 0).catch(() => {});
      }
    };
    const onTypingEvent = (_e: unknown, m?: { roomId?: string }) => {
      if (m?.roomId && m.roomId !== roomId) return;
      const names = typingNames(client, room);
      typingListeners.forEach((cb) => cb(names));
    };
    client.on(RoomMemberEvent.Typing as never, onTypingEvent as never);

    // Computed once, before the caller marks the room read.
    const me = client.getUserId() ?? "";
    const readUpTo = room.getEventReadUpTo(me);
    const liveEvents = room.getLiveTimeline().getEvents();
    const readIdx = readUpTo ? liveEvents.findIndex((e) => e.getId() === readUpTo) : -1;
    const firstUnread =
      readIdx < 0
        ? null
        : (current.find((i) => !i.isOwn && i.content.kind !== "service" && liveEvents.findIndex((e) => e.getId() === i.id) > readIdx)?.id ?? null);

    return {
      firstUnreadEventId: firstUnread,
      setTyping: (typing: boolean) => {
        if (!typing) {
          stopTyping();
          return;
        }
        const now = Date.now();
        if (!typingOn || now - typingSentAt > 3000) {
          typingOn = true;
          typingSentAt = now;
          void client.sendTyping(roomId, true, 6000).catch(() => {});
        }
        clearTimeout(typingTimer);
        typingTimer = setTimeout(stopTyping, 5000); // stopped typing without sending
      },
      onTyping: (cb: Listener<string[]>) => {
        typingListeners.add(cb);
        cb(typingNames(client, room));
        return () => {
          typingListeners.delete(cb);
        };
      },
      subscribe: (cb) => {
        listeners.add(cb);
        cb([{ op: "reset", items: current }]);
        return () => {
          listeners.delete(cb);
        };
      },
      paginateBackwards: () =>
        guard(async () => {
          if (!room.getLiveTimeline().getPaginationToken(Direction.Backward)) return;
          await client.paginateEventTimeline(room.getLiveTimeline(), { backwards: true, limit: 30 });
        }),
      sendText: (body) =>
        guard(async () => {
          await client.sendTextMessage(roomId, body);
        }),
      sendAttachment: (file: AttachmentSource) =>
        guard(async () => {
          const blob = file.data as Blob;
          const isImage = file.mimeType.startsWith("image/");
          let dims: { w: number; h: number } | undefined;
          if (isImage && typeof createImageBitmap === "function") {
            try {
              const bmp = await createImageBitmap(blob);
              dims = { w: bmp.width, h: bmp.height };
              bmp.close();
            } catch {
              /* not decodable: send without size */
            }
          }
          const info = { mimetype: file.mimeType, size: file.size, ...dims };
          const content: Record<string, unknown> = { msgtype: isImage ? "m.image" : "m.file", body: file.name, filename: file.name, info };
          if (client.isRoomEncrypted(roomId) || (await client.getCrypto()?.isEncryptionEnabledInRoom(roomId))) {
            const { data, info: enc } = await encryptAttachment(await blob.arrayBuffer());
            const up = await client.uploadContent(new Blob([data]), { name: file.name, type: "application/octet-stream", includeFilename: false });
            content.file = { ...enc, url: up.content_uri, mimetype: file.mimeType };
          } else {
            content.url = (await client.uploadContent(blob, { name: file.name, type: file.mimeType })).content_uri;
          }
          await client.sendMessage(roomId, content as never);
        }),
      edit: (eventId, body) =>
        guard(async () => {
          await client.sendMessage(roomId, {
            msgtype: "m.text",
            body: `* ${body}`,
            "m.new_content": { msgtype: "m.text", body },
            "m.relates_to": { rel_type: RelationType.Replace, event_id: eventId },
          } as never);
        }),
      redact: (eventId) =>
        guard(async () => {
          await client.redactEvent(roomId, eventId);
        }),
      reply: (eventId, body) =>
        guard(async () => {
          await client.sendMessage(roomId, { msgtype: "m.text", body, "m.relates_to": { "m.in_reply_to": { event_id: eventId } } } as never);
        }),
      react: (eventId, key) =>
        guard(async () => {
          const mine = room.relations.getChildEventsForEvent(eventId, RelationType.Annotation, EventType.Reaction)?.getAnnotationsBySender()?.[
            client.getUserId() ?? ""
          ];
          const existing = [...(mine ?? [])].find((e) => e.getRelation()?.key === key && !e.isRedacted());
          if (existing?.getId()) {
            await client.redactEvent(roomId, existing.getId()!);
            return;
          }
          await client.sendEvent(
            roomId,
            EventType.Reaction as never,
            {
              "m.relates_to": { rel_type: RelationType.Annotation, event_id: eventId, key },
            } as never,
          );
        }),
      markRead: () =>
        guard(async () => {
          const events = room.getLiveTimeline().getEvents();
          const last = events[events.length - 1];
          if (last && last.getId() && !last.isSending()) await client.sendReadReceipt(last);
          if ((room.getAccountData("m.marked_unread")?.getContent() as { unread?: boolean } | undefined)?.unread) {
            await client.setRoomAccountData(roomId, "m.marked_unread" as never, { unread: false } as never);
          }
        }),
      close: () => {
        client.off(RoomEvent.Timeline, onEvent as never);
        client.off(RoomEvent.LocalEchoUpdated, onEvent as never);
        client.off(RoomEvent.Redaction, onEvent as never);
        client.off(MatrixEventEvent.Decrypted, onDecrypted);
        client.off(RoomEvent.Receipt, onReceipt as never);
        stopTyping();
        client.off(RoomMemberEvent.Typing as never, onTypingEvent as never);
        client.off(MatrixEventEvent.Replaced, refresh as never);
        listeners.clear();
      },
    };
  }
}
