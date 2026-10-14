import {
  ClientEvent,
  createClient,
  Method,
  Direction,
  Filter,
  IndexedDBStore,
  PendingEventOrdering,
  MatrixError,
  MemoryStore,
  MatrixEventEvent,
  RoomEvent,
  SyncState as SdkSync,
  EventType,
  PushRuleActionName,
  PushRuleKind,
  RelationType,
  RoomType,
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
  type DeviceInfo,
  type IncomingNotification,
  type SearchPage,
  type SearchResult,
  type MemberRole,
  type HistoryVisibility,
  type PowerThresholds,
  type JoinRule,
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
  type SpaceChild,
  type MediaKind,
  type SharedMediaPage,
  type Session,
  type SyncState,
  type TimelineHandle,
  type TimelineItem,
} from "@ohmatrix/core";
import { nameOf, notificationPreview, pinnedIds, roomItems, stripReplyFallback, toRoomSummary, toTimelineItem, typingNames, firstUrls } from "./convert.js";
import { decryptAttachment, encryptAttachment, type EncryptedFile } from "./attachments.js";
import { probeMedia, type Probe } from "./probe.js";
import { resolveHomeserver } from "./discovery.js";
import { diffTimeline } from "./diff.js";
import { aliasLocalpart, thresholdsOf } from "./roomSettings.js";
import { childRooms, isDirectRoom } from "./spaces.js";
import { mediaKindOf } from "./sharedMedia.js";
import { JsSecurity, SecretKeyCache } from "./security.js";

function wrap(e: unknown): EngineError {
  if (e instanceof EngineError) return e;
  let code: EngineErrorCode = "unknown";
  if (e instanceof MatrixError) {
    code =
      e.errcode === "M_UNKNOWN_TOKEN"
        ? "unauthorized"
        : e.errcode === "M_FORBIDDEN" || e.httpStatus === 403
          ? "forbidden"
          : e.errcode === "M_LIMIT_EXCEEDED"
            ? "rate_limited"
            : e.errcode === "M_NOT_FOUND"
              ? "not_found"
              : e.errcode === "M_ROOM_IN_USE" || e.errcode === "M_USER_IN_USE" || e.httpStatus === 409
                ? "conflict"
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
/** Custom profile field holding the status line. */
const STATUS_FIELD = "com.ohmatrix.status";

const ROLE_LEVEL: Record<MemberRole, number> = { admin: 100, moderator: 50, member: 0 };
const roleOf = (power: number): MemberRole => (power >= 100 ? "admin" : power >= 50 ? "moderator" : "member");

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
/**
 * Open-graph previews for the links in an outgoing body, fetched through the homeserver (which does the
 * network access, so the client is not the one revealing what is being linked). Shape: Element/Beeper's
 * `com.beeper.linkpreviews`, which is also what we render when other clients send it.
 */
async function linkPreviews(client: MatrixClient, body: string): Promise<Record<string, unknown>> {
  const urls = firstUrls(body);
  if (!urls.length) return {};
  const previews = await Promise.all(
    urls.map(async (url) => {
      try {
        const p = await client.getUrlPreview(url, Date.now());
        const str = (k: string) => (typeof p[k] === "string" && p[k] ? (p[k] as string) : undefined);
        if (!str("og:title") && !str("og:description") && !str("og:image")) return null;
        return {
          "og:url": url,
          matched_url: url,
          ...(str("og:title") ? { "og:title": str("og:title") } : {}),
          ...(str("og:description") ? { "og:description": str("og:description") } : {}),
          ...(str("og:image")
            ? {
                "og:image": str("og:image"),
                "og:image:type": str("og:image:type"),
                "og:image:width": p["og:image:width"],
                "og:image:height": p["og:image:height"],
              }
            : {}),
          ...(str("og:site_name") ? { "og:site_name": str("og:site_name") } : {}),
        };
      } catch {
        return null; // no preview available (server disallows it, or the page has no open-graph data)
      }
    }),
  );
  const kept = previews.filter(Boolean);
  return kept.length ? { "com.beeper.linkpreviews": kept } : {};
}

/** Published addresses of a room: the main one first, then the alternatives. */
function aliasState(room: Room | null): { main?: string; aliases: string[] } {
  const c = (room?.currentState.getStateEvents(EventType.RoomCanonicalAlias, "")?.getContent() ?? {}) as { alias?: unknown; alt_aliases?: unknown };
  const main = typeof c.alias === "string" && c.alias ? c.alias : undefined;
  const alts = Array.isArray(c.alt_aliases) ? c.alt_aliases.filter((a): a is string => typeof a === "string") : [];
  return { ...(main ? { main } : {}), aliases: [...(main ? [main] : []), ...alts.filter((a) => a !== main)] };
}

/** `m.mentions` block, only when there is something to mention. */
function mentionBlock(mentions?: string[]): Record<string, unknown> {
  return mentions?.length ? { "m.mentions": { user_ids: mentions } } : {};
}

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
    this.caughtUp = false;
    this.startedAt = Date.now();
    client.on(ClientEvent.Sync, (state) => {
      if (state === SdkSync.Prepared || state === SdkSync.Syncing) this.caughtUp = true;
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
    client.on(RoomEvent.Timeline, (ev, room, toStart, removed, data) => {
      if (!room || toStart || removed || !data?.liveEvent || !this.caughtUp) return; // initial-sync history is flagged live too
      const id = ev.getId();
      if (id) {
        this.liveIds.push(id);
        if (this.liveIds.length > 300) this.liveIds.shift();
      }
      this.considerNotification(client, ev);
    });
    // Late decryption of an old message (keys arriving afterwards) must not notify: only events first seen live.
    client.on(MatrixEventEvent.Decrypted, (ev) => {
      if (this.liveIds.includes(ev.getId() ?? "")) this.considerNotification(client, ev);
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
      const status = (info as Record<string, unknown>)[STATUS_FIELD];
      this.emitProfile({
        userId: id,
        displayName: info.displayname || id.replace(/^@/, "").replace(/:.*$/, ""),
        ...(info.avatar_url && { avatar: info.avatar_url }),
        ...(typeof status === "string" && status && { status }),
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
    setStatus: (status: string) =>
      guard(async () => {
        const c = this.requireClient();
        const path = `/profile/${encodeURIComponent(c.getUserId()!)}/${STATUS_FIELD}`;
        try {
          if (status.trim()) await c.http.authedRequest(Method.Put, path, undefined, { [STATUS_FIELD]: status.trim() });
          else await c.http.authedRequest(Method.Delete, path);
        } catch (e) {
          if (e instanceof MatrixError && (e.errcode === "M_UNRECOGNIZED" || e.httpStatus === 404 || e.httpStatus === 405))
            throw new EngineError("unsupported", "This server does not support profile status.", e);
          throw e;
        }
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

  readonly search = {
    messages: (o: { term: string; roomId?: RoomId; from?: string }) =>
      guard(async (): Promise<SearchPage> => {
        const c = this.requireClient();
        const term = o.term.trim();
        if (term.length < 2) return { results: [], localRooms: 0 };
        const name = (roomId: string) => c.getRoom(roomId)?.name || roomId;
        const results: SearchResult[] = [];

        // The server finds messages in rooms it can read.
        const res = await c.search({
          ...(o.from && { next_batch: o.from }),
          body: {
            search_categories: {
              room_events: {
                search_term: term,
                keys: ["content.body"],
                order_by: "recent" as never,
                filter: { limit: 20, types: ["m.room.message"], ...(o.roomId && { rooms: [o.roomId] }) },
              },
            },
          },
        });
        const cat = res.search_categories.room_events;
        for (const hit of cat?.results ?? []) {
          const ev = hit.result;
          const body = typeof ev.content?.body === "string" ? ev.content.body : "";
          if (!body) continue;
          const member = c.getRoom(ev.room_id)?.getMember(ev.sender);
          results.push({
            eventId: ev.event_id,
            roomId: ev.room_id,
            roomName: name(ev.room_id),
            sender: ev.sender,
            senderName: nameOf(member, ev.sender),
            ts: ev.origin_server_ts,
            text: stripReplyFallback(body),
            local: false,
          });
        }

        // Encrypted rooms are opaque to the server: look through what this device has (first page only).
        let localRooms = 0;
        if (!o.from) {
          const needle = term.toLowerCase();
          const rooms = o.roomId ? [c.getRoom(o.roomId)] : c.getRooms();
          for (const room of rooms) {
            if (!room || room.getMyMembership() !== "join" || !c.isRoomEncrypted(room.roomId)) continue;
            localRooms++;
            for (const ev of room.getLiveTimeline().getEvents()) {
              await c.decryptEventIfNeeded(ev).catch(() => {});
              if (ev.getType() !== EventType.RoomMessage || ev.isRedacted() || ev.isRelation("m.replace")) continue;
              const body = ev.getContent().body;
              if (typeof body !== "string" || !body.toLowerCase().includes(needle)) continue;
              const id = ev.getId();
              if (!id) continue;
              results.push({
                eventId: id,
                roomId: room.roomId,
                roomName: name(room.roomId),
                sender: ev.getSender() ?? "",
                senderName: nameOf(ev.sender, ev.getSender() ?? ""),
                ts: ev.getTs(),
                text: stripReplyFallback(body),
                local: true,
              });
            }
          }
        }
        results.sort((x, y) => y.ts - x.ts);
        return { results, localRooms, ...(cat?.next_batch && { next: cat.next_batch }) };
      }),
  };

  readonly roomAdmin = {
    setName: (roomId: RoomId, name: string) =>
      guard(async () => {
        await this.requireClient().setRoomName(roomId, name.trim());
      }),
    setTopic: (roomId: RoomId, topic: string) =>
      guard(async () => {
        await this.requireClient().setRoomTopic(roomId, topic.trim());
      }),
    setAvatar: (roomId: RoomId, file: AttachmentSource) =>
      guard(async () => {
        const c = this.requireClient();
        const up = await c.uploadContent(file.data as Blob, { name: file.name, type: file.mimeType });
        await c.sendStateEvent(roomId, EventType.RoomAvatar as never, { url: up.content_uri } as never, "");
      }),
    invite: (roomId: RoomId, userIds: string[]) =>
      guard(async () => {
        const c = this.requireClient();
        for (const id of userIds) await c.invite(roomId, id);
      }),
    kick: (roomId: RoomId, userId: string) =>
      guard(async () => {
        await this.requireClient().kick(roomId, userId);
      }),
    setRole: (roomId: RoomId, userId: string, role: MemberRole) =>
      guard(async () => {
        await this.requireClient().setPowerLevel(roomId, userId, ROLE_LEVEL[role]);
      }),
    setPower: (roomId: RoomId, userId: string, level: number) =>
      guard(async () => {
        if (!Number.isInteger(level) || level < -1000 || level > 1000) throw new EngineError("unknown", "invalid power level");
        await this.requireClient().setPowerLevel(roomId, userId, level);
      }),
    setThresholds: (roomId: RoomId, patch: Partial<PowerThresholds>) =>
      guard(async () => {
        const c = this.requireClient();
        const room = c.getRoom(roomId);
        const now = (room?.currentState.getStateEvents(EventType.RoomPowerLevels, "")?.getContent() ?? {}) as Record<string, unknown>;
        const next: Record<string, unknown> = { ...now, events: { ...((now.events as object | undefined) ?? {}) } };
        const set = (k: string, v: number | undefined) => v !== undefined && (next[k] = v);
        set("invite", patch.invite);
        set("kick", patch.kick);
        set("ban", patch.ban);
        set("redact", patch.redact);
        set("events_default", patch.sendMessages);
        set("state_default", patch.changeSettings);
        if (patch.changeLevels !== undefined) (next.events as Record<string, number>)["m.room.power_levels"] = patch.changeLevels;
        await c.sendStateEvent(roomId, EventType.RoomPowerLevels as never, next as never, "");
      }),
    ban: (roomId: RoomId, userId: string, reason?: string) =>
      guard(async () => {
        await this.requireClient().ban(roomId, userId, reason?.trim() || undefined);
      }),
    unban: (roomId: RoomId, userId: string) =>
      guard(async () => {
        await this.requireClient().unban(roomId, userId);
      }),
    setHistoryVisibility: (roomId: RoomId, visibility: HistoryVisibility) =>
      guard(async () => {
        await this.requireClient().sendStateEvent(roomId, EventType.RoomHistoryVisibility as never, { history_visibility: visibility } as never, "");
      }),
    setJoinRule: (roomId: RoomId, rule: "public" | "invite") =>
      guard(async () => {
        await this.requireClient().sendStateEvent(roomId, EventType.RoomJoinRules as never, { join_rule: rule } as never, "");
      }),
    addAlias: (roomId: RoomId, localpart: string) =>
      guard(async () => {
        const c = this.requireClient();
        const local = aliasLocalpart(localpart);
        if (!/^[a-z0-9._=\-/+]+$/.test(local)) throw new EngineError("unknown", "invalid address");
        const alias = `#${local}:${c.getDomain() ?? (c.getUserId() ?? "").split(":").slice(1).join(":")}`;
        await c.createAlias(alias, roomId);
        const cur = aliasState(c.getRoom(roomId));
        const aliases = [...cur.aliases, alias];
        await c.sendStateEvent(
          roomId,
          EventType.RoomCanonicalAlias as never,
          { ...(cur.main ? { alias: cur.main } : { alias }), alt_aliases: aliases.filter((a) => a !== (cur.main ?? alias)) } as never,
          "",
        );
        return alias;
      }),
    removeAlias: (roomId: RoomId, alias: string) =>
      guard(async () => {
        const c = this.requireClient();
        const cur = aliasState(c.getRoom(roomId));
        const rest = cur.aliases.filter((a) => a !== alias);
        const main = cur.main === alias ? rest[0] : cur.main;
        await c.sendStateEvent(
          roomId,
          EventType.RoomCanonicalAlias as never,
          { ...(main ? { alias: main } : {}), alt_aliases: rest.filter((a) => a !== main) } as never,
          "",
        );
        await c.deleteAlias(alias).catch(() => {}); // only aliases created through the directory can be deleted; the rest are just unpublished
      }),
    setMainAlias: (roomId: RoomId, alias: string) =>
      guard(async () => {
        const c = this.requireClient();
        const cur = aliasState(c.getRoom(roomId));
        if (!cur.aliases.includes(alias)) throw new EngineError("not_found", "unknown address");
        await c.sendStateEvent(roomId, EventType.RoomCanonicalAlias as never, { alias, alt_aliases: cur.aliases.filter((a) => a !== alias) } as never, "");
      }),
  };

  readonly devices = {
    list: () =>
      guard(async (): Promise<DeviceInfo[]> => {
        const c = this.requireClient();
        const mine = c.getDeviceId();
        const { devices } = await c.getDevices();
        return devices
          .map((d) => ({
            id: d.device_id,
            name: d.display_name || d.device_id,
            current: d.device_id === mine,
            ...(d.last_seen_ts && { lastSeenTs: d.last_seen_ts }),
            ...(d.last_seen_ip && { lastSeenIp: d.last_seen_ip.replace(/^::ffff:/, "") }),
          }))
          .sort((a, b) => Number(b.current) - Number(a.current) || (b.lastSeenTs ?? 0) - (a.lastSeenTs ?? 0));
      }),
    remove: (ids: string[], password: string) =>
      guard(async () => {
        const c = this.requireClient();
        const others = ids.filter((id) => id !== c.getDeviceId()); // signing out the running session is "Sign out"
        if (others.length === 0) return;
        await c.deleteMultipleDevices(others, { type: "m.login.password", identifier: { type: "m.id.user", user: c.getUserId()! }, password } as never);
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

  private notifyListeners = new Set<Listener<IncomingNotification>>();
  private notified: string[] = [];
  private liveIds: string[] = [];
  private waitingForKeys = new Map<string, ReturnType<typeof setTimeout>>();
  private caughtUp = false;
  private startedAt = 0;

  /** Emits a notification for a live message from someone else if the account's push rules say it notifies. */
  private considerNotification(client: MatrixClient, ev: MatrixEvent, giveUpWaiting = false): void {
    const id = ev.getId(),
      roomId = ev.getRoomId();
    if (!id || !roomId || this.notifyListeners.size === 0 || ev.getSender() === client.getUserId() || this.notified.includes(id)) return;
    if (ev.isBeingDecrypted() || (ev.getType() === EventType.RoomMessageEncrypted && !ev.isDecryptionFailure())) return; // evaluated again when decryption finishes
    if (id) {
      const waiting = this.waitingForKeys.get(id);
      if (!ev.isDecryptionFailure() && waiting) {
        clearTimeout(waiting);
        this.waitingForKeys.delete(id);
      }
      if (ev.isDecryptionFailure() && !giveUpWaiting) {
        // The room key often arrives a moment after the message: wait briefly for a readable preview.
        if (!waiting)
          this.waitingForKeys.set(
            id,
            setTimeout(() => {
              this.waitingForKeys.delete(id);
              this.considerNotification(client, ev, true);
            }, 4000),
          );
        return;
      }
    }
    if (ev.getType() !== EventType.RoomMessage && ev.getType() !== EventType.RoomMessageEncrypted) return;
    if (ev.isRelation("m.replace") || ev.isRedacted() || ev.getTs() < this.startedAt - 10_000) return; // not news: arrived before we were running
    const room = client.getRoom(roomId);
    if (!room) return;
    const actions = client.getPushActionsForEvent(ev);
    if (!actions?.notify) return;
    this.notified.push(id);
    if (this.notified.length > 300) this.notified.shift();
    const preview = notificationPreview(ev);
    const n: IncomingNotification = {
      eventId: id,
      roomId,
      roomName: room.name || roomId,
      isDirect: toRoomSummary(client, room).isDirect,
      senderName: nameOf(ev.sender, ev.getSender() ?? ""),
      highlight: !!actions.tweaks?.highlight,
      ...(preview !== undefined && { preview }),
    };
    this.notifyListeners.forEach((cb) => cb(n));
  }

  readonly notifications = {
    subscribe: (cb: Listener<IncomingNotification>) => {
      this.notifyListeners.add(cb);
      return () => {
        this.notifyListeners.delete(cb);
      };
    },
  };

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
        const baseUrl = await resolveHomeserver(homeserver);
        const res = await createClient({ baseUrl, localTimeoutMs: 20_000 }).login("m.login.password", {
          identifier: { type: "m.id.user", user: username },
          password,
          initial_device_display_name: "OhMatrix Web",
        });
        const session: Session = { homeserver: baseUrl, userId: res.user_id, deviceId: res.device_id, accessToken: res.access_token };
        await this.auth.restore(session);
        return session;
      }),
    register: (homeserver: string, username: string, password: string) =>
      guard(async (): Promise<Session> => {
        const baseUrl = await resolveHomeserver(homeserver);
        const client = createClient({ baseUrl, localTimeoutMs: 20_000 });
        const body = { username, password, initial_device_display_name: "OhMatrix Web" };
        // A server answers the first request with the steps it wants done ("flows"); the one we can do alone is the
        // "dummy" step. Anything else (an e-mail address, a captcha, terms) is more than a password form can answer.
        let auth: { session?: string; type: string } | undefined;
        let res: { user_id: string; device_id?: string; access_token?: string } | undefined;
        try {
          res = await client.registerRequest(body);
        } catch (e) {
          const data = e instanceof MatrixError ? (e.data as { flows?: Array<{ stages: string[] }>; session?: string }) : undefined;
          if (!(e instanceof MatrixError) || e.httpStatus !== 401 || !data?.flows) throw e;
          if (!data.flows.some((f) => f.stages.every((st) => st === "m.login.dummy")))
            throw new EngineError("unsupported", "This server needs more than a username and password to register.", e);
          auth = { type: "m.login.dummy", ...(data.session && { session: data.session }) };
        }
        res ??= await client.registerRequest({ ...body, ...(auth && { auth }) });
        if (!res.access_token || !res.device_id) throw new EngineError("unknown", "The server did not sign the new account in.");
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

  /**
   * Forward a message: text and mentions are copied, media is fetched (and decrypted in an encrypted
   * room) and re-uploaded into the target room, so its own encryption keys apply.
   */
  readonly messages = {
    forward: (params: { fromRoomId: string; eventId: string; toRoomId: string }) =>
      guard(async () => {
        const client = this.requireClient();
        const source = client.getRoom(params.fromRoomId);
        const ev = source?.findEventById(params.eventId);
        console.log(
          "FWDDBG",
          JSON.stringify({
            from: params.fromRoomId,
            to: params.toRoomId,
            eventId: params.eventId,
            hasRoom: !!source,
            hasEv: !!ev,
            live: source?.getLiveTimeline().getEvents().length,
          }),
        );
        if (!ev) throw new EngineError("not_found", "the message is no longer available");
        const item = toTimelineItem(client, ev);
        if (!item) throw new EngineError("unsupported", "this message cannot be forwarded");
        const c = item.content;
        const to = this.openTimeline(params.toRoomId);
        try {
          if (c.kind === "text") {
            const prefix = item.sender ? `${item.senderName}:\n` : "";
            await to.sendText(`${prefix}${c.body}`, c.mentions);
            return;
          }
          if (c.kind !== "image" && c.kind !== "file" && c.kind !== "video" && c.kind !== "audio") {
            throw new EngineError("unsupported", "this message cannot be forwarded");
          }
          const enc = "encryption" in c && c.encryption ? { encryption: c.encryption, ...(c.mimeType ? { mimeType: c.mimeType } : {}) } : {};
          const url = await this.media.resolve(c.url, enc);
          const blob = await (await fetch(url)).blob();
          const name = c.kind === "file" || c.kind === "video" || c.kind === "audio" ? c.name : c.body || "image";
          await to.sendAttachment({
            name,
            mimeType: c.mimeType ?? blob.type ?? "application/octet-stream",
            size: blob.size,
            data: blob,
            ...(c.kind === "video" || c.kind === "audio" ? (c.durationMs ? { durationMs: c.durationMs } : {}) : {}),
            ...(c.kind === "audio" && c.voice ? { voice: true, ...(c.waveform ? { waveform: c.waveform } : {}) } : {}),
          });
        } finally {
          to.close();
        }
      }),
  };

  /** Spaces (MSC1772): a space is a room with type m.space whose children are other rooms. */
  readonly spaces = {
    children: (spaceId: string) =>
      guard(async () => {
        const c = this.requireClient();
        const room = c.getRoom(spaceId);
        if (!room) throw new EngineError("not_found", `unknown space ${spaceId}`);
        return childRooms(c, room).map(({ id, via }) => {
          const child = c.getRoom(id);
          const summary = child && child.getMyMembership() === "join" ? toRoomSummary(c, child) : null;
          const name = summary?.name ?? (child?.name || id);
          const avatar = summary?.avatar ?? child?.getMxcAvatarUrl() ?? undefined;
          return {
            roomId: id,
            name,
            ...(avatar && { avatar }),
            isSpace: child?.getType() === RoomType.Space,
            ...(via.length && !summary ? { via } : {}),
            unreadCount: summary?.unreadCount ?? 0,
            highlightCount: summary?.highlightCount ?? 0,
          } satisfies SpaceChild;
        });
      }),
    subscribe: (spaceId: string, cb: Listener<SpaceChild[]>) => {
      const c = this.requireClient();
      let live = true,
        pending = false;
      const emit = () => {
        if (pending) return;
        pending = true;
        queueMicrotask(() => {
          pending = false;
          void this.spaces.children(spaceId).then(
            (kids) => live && cb(kids),
            () => {},
          );
        });
      };
      // The child list lives in the space's state; names and unread counts live in the children.
      c.on(RoomStateEvent.Events, emit as never);
      c.on(RoomEvent.Name, emit as never);
      c.on(RoomEvent.Timeline, emit as never);
      c.on(RoomEvent.UnreadNotifications as never, emit as never);
      c.on(RoomEvent.MyMembership, emit as never);
      emit();
      return () => {
        live = false;
        c.off(RoomStateEvent.Events, emit as never);
        c.off(RoomEvent.Name, emit as never);
        c.off(RoomEvent.Timeline, emit as never);
        c.off(RoomEvent.UnreadNotifications as never, emit as never);
        c.off(RoomEvent.MyMembership, emit as never);
      };
    },
    addChild: (spaceId: string, roomId: string, via?: string) =>
      guard(async () => {
        const c = this.requireClient();
        const space = c.getRoom(spaceId);
        let order = 0;
        const kids = space ? childRooms(c, space) : [];
        if (kids.length) order = Math.max(...kids.map((k) => Number(k.order) || 0)) + 1;
        await c.sendStateEvent(spaceId, EventType.SpaceChild as never, { order: String(order), ...(via ? { via: [via] } : {}) } as never, roomId);
        // The child records its parent too, so clients can nest it in a tree without reading the space.
        const domain = via ?? c.getDomain() ?? undefined;
        await c.sendStateEvent(roomId, EventType.SpaceParent as never, { ...(domain ? { via: [domain] } : {}) } as never, spaceId);
      }),
    removeChild: (spaceId: string, roomId: string) =>
      guard(async () => {
        const c = this.requireClient();
        await c.sendStateEvent(spaceId, EventType.SpaceChild as never, {} as never, roomId);
        await c.sendStateEvent(roomId, EventType.SpaceParent as never, {} as never, spaceId);
      }),
    moveChild: (spaceId: string, roomId: string, to: "first" | "last") =>
      guard(async () => {
        const c = this.requireClient();
        const space = c.getRoom(spaceId);
        const kids = space ? childRooms(c, space) : [];
        const others = kids.filter((k) => k.id !== roomId);
        const order =
          to === "first" ? (Math.min(...kids.map((k) => Number(k.order) || 0), 0) || 0) - 1 : Math.max(0, ...others.map((k) => Number(k.order) || 0)) + 1;
        const cur = kids.find((k) => k.id === roomId);
        await c.sendStateEvent(spaceId, EventType.SpaceChild as never, { order: String(order), ...(cur?.via.length ? { via: cur.via } : {}) } as never, roomId);
      }),
    candidates: (spaceId: string) =>
      guard(async () => {
        const c = this.requireClient();
        const space = c.getRoom(spaceId);
        if (!space) throw new EngineError("not_found", `unknown space ${spaceId}`);
        const inSpace = new Set(childRooms(c, space).map((k) => k.id));
        return c
          .getRooms()
          .filter((r) => r.getMyMembership() === "join" && r.getType() !== RoomType.Space && !inSpace.has(r.roomId) && !isDirectRoom(c, r))
          .map((r) => {
            const s = toRoomSummary(c, r);
            return {
              roomId: r.roomId,
              name: s.name,
              ...(s.avatar && { avatar: s.avatar }),
              isSpace: false,
              unreadCount: s.unreadCount,
              highlightCount: s.highlightCount,
            } satisfies SpaceChild;
          })
          .sort((a, b) => a.name.localeCompare(b.name));
      }),
  };

  readonly media = {
    sharedPage: (roomId: string, o: { kind: MediaKind; from?: string; want?: number }) =>
      guard(async (): Promise<SharedMediaPage> => {
        const c = this.requireClient();
        const room = c.getRoom(roomId);
        if (!room) throw new EngineError("not_found", `unknown room ${roomId}`);
        const want = Math.max(1, o.want ?? 30);
        const encrypted = c.isRoomEncrypted(roomId);
        // An open room's media events carry a url the server can filter on; an encrypted room's are opaque to it, so
        // there it can only narrow down to messages and the kind is decided here, after decrypting.
        const filter = new Filter(c.getUserId());
        filter.setDefinition({
          room: { timeline: encrypted ? { types: ["m.room.message", "m.room.encrypted"] } : { types: ["m.room.message"], contains_url: true } },
        });
        const map = c.getEventMapper();
        const items: TimelineItem[] = [];
        let from: string | null = o.from ?? null;
        let next: string | undefined = o.from;
        // A page is a batch of the room's history, however many of it are the kind asked for; keep going until enough are.
        for (let round = 0; round < 12 && items.length < want; round++) {
          const res = await c.createMessagesRequest(roomId, from, 100, Direction.Backward, filter);
          for (const raw of res.chunk) {
            const ev = map(raw);
            const sender = ev.getSender();
            if (sender) ev.sender = room.getMember(sender);
            if (ev.isEncrypted()) await c.decryptEventIfNeeded(ev).catch(() => {});
            const item = toTimelineItem(c, ev);
            if (item && mediaKindOf(item.content) === o.kind) items.push(item);
          }
          next = res.end ?? undefined;
          if (!res.end || res.chunk.length === 0) {
            next = undefined;
            break;
          }
          from = res.end;
        }
        // The server hands out an end token even for the last batch; only an empty reply proves the beginning was
        // reached. Look once more before offering a "next", so the caller is never sent to a page that holds nothing.
        if (next) {
          const probe = await c.createMessagesRequest(roomId, next, 1, Direction.Backward, filter);
          if (probe.chunk.length === 0) next = undefined;
        }
        return { items, ...(next ? { next } : {}) };
      }),
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
              role: roleOf(m.powerLevel),
              power: m.powerLevel,
              ...(m.membership === "invite" && { invited: true }),
            } as RoomMember;
          })
          .sort((a, b) => Number(a.invited ?? false) - Number(b.invited ?? false) || a.name.localeCompare(b.name));
        const topic = room.currentState.getStateEvents("m.room.topic" as never, "")?.getContent().topic as string | undefined;
        const avatar = room.getMxcAvatarUrl() ?? undefined;
        const { main, aliases } = aliasState(room);
        const alias = main ?? room.getCanonicalAlias() ?? undefined;
        const pl = thresholdsOf(room.currentState.getStateEvents(EventType.RoomPowerLevels, "")?.getContent());
        const rule = (room.currentState.getStateEvents(EventType.RoomJoinRules, "")?.getContent().join_rule as string | undefined) ?? "invite";
        const joinRule: JoinRule = rule === "public" || rule === "invite" || rule === "knock" || rule === "restricted" ? rule : "other";
        const hv = room.currentState.getStateEvents(EventType.RoomHistoryVisibility, "")?.getContent().history_visibility as string | undefined;
        const historyVisibility: HistoryVisibility = hv === "invited" || hv === "joined" || hv === "world_readable" ? hv : "shared";
        const banned = room.getMembersWithMembership("ban").map((m) => {
          const reason = m.events.member?.getContent().reason as string | undefined;
          return { userId: m.userId, name: nameOf(m, m.userId), ...(reason && { reason }) };
        });
        const summary = toRoomSummary(c, room);
        const me = c.getUserId() ?? "";
        const myPower = room.getMember(me)?.powerLevel ?? 0;
        const st = room.currentState;
        const manage = !summary.isDirect; // one-to-one chats have nothing to administer
        return {
          id: roomId,
          name: room.name || roomId,
          isDirect: summary.isDirect,
          isEncrypted: c.isRoomEncrypted(roomId),
          members,
          muted: !!summary.muted,
          me,
          myRole: roleOf(myPower),
          pinnedEventIds: pinnedIds(room),
          aliases: aliases.length ? aliases : alias ? [alias] : [],
          joinRule,
          historyVisibility,
          levels: pl,
          banned,
          can: {
            editInfo: manage && st.maySendStateEvent(EventType.RoomName, me) && st.maySendStateEvent(EventType.RoomTopic, me),
            invite: manage && st.hasSufficientPowerLevelFor("invite", myPower),
            kick: manage && st.hasSufficientPowerLevelFor("kick", myPower),
            ban: manage && st.hasSufficientPowerLevelFor("ban", myPower),
            changeSettings: manage && st.maySendStateEvent(EventType.RoomJoinRules, me) && st.maySendStateEvent(EventType.RoomHistoryVisibility, me),
            changeRoles: manage && st.maySendStateEvent(EventType.RoomPowerLevels, me),
            pin: manage && st.maySendStateEvent(EventType.RoomPinnedEvents, me),
          },
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
      c.on(ClientEvent.AccountData, refresh as never); // push rules: mute
      c.on(RoomStateEvent.Members, refresh as never);
      c.on(RoomStateEvent.Events, refresh as never);
      refresh();
      return () => {
        live = false;
        c.off(RoomEvent.Name, refresh as never);
        c.off(ClientEvent.AccountData, refresh as never);
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
    setMuted: (roomId: RoomId, muted: boolean) =>
      guard(async () => {
        const c = this.requireClient();
        if (muted) {
          await c.addPushRule("global", PushRuleKind.RoomSpecific, roomId, { actions: [PushRuleActionName.DontNotify] });
          await c.setPushRuleEnabled("global", PushRuleKind.RoomSpecific, roomId, true);
        } else if (c.getRoomPushRule("global", roomId)) {
          await c.deletePushRule("global", PushRuleKind.RoomSpecific, roomId);
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
    createSpace: (o: { name: string; topic?: string; invite?: string[] }) =>
      guard(async () => {
        const c = this.requireClient();
        const { room_id } = await c.createRoom({
          name: o.name,
          ...(o.topic ? { topic: o.topic } : {}),
          ...(o.invite?.length ? { invite: o.invite } : {}),
          // A space is a container, not a chat: public join rule, no encryption, no history for newcomers.
          preset: "public_chat" as never,
          creation_content: { type: RoomType.Space } as never,
          initial_state: [
            { type: "m.room.history_visibility", state_key: "", content: { history_visibility: "shared" } },
            { type: "m.room.guest_access", state_key: "", content: { guest_access: "can_join" } },
          ] as never,
        });
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
    // Files being uploaded are shown in the timeline (with progress) until their message exists.
    interface Pending {
      id: string;
      name: string;
      mimeType: string;
      size: number;
      loaded: number;
      total: number;
      startedAt: number;
      previewUrl?: string;
      failed?: boolean;
      abort: AbortController;
      /** What was picked, kept so that a failed upload can be tried again. */
      source: AttachmentSource;
    }
    const uploading = new Map<string, Pending>();
    const kindOf = (mime: string) => (mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "file");
    const uploadItems = (): TimelineItem[] =>
      [...uploading.values()].map((u) => {
        const base = { name: u.name, size: u.size, mimeType: u.mimeType, url: "" };
        const k = kindOf(u.mimeType);
        const content: TimelineItem["content"] =
          k === "image"
            ? { kind: "image", url: "", body: u.name, mimeType: u.mimeType }
            : k === "video"
              ? { kind: "video", ...base }
              : k === "audio"
                ? { kind: "audio", ...base }
                : { kind: "file", ...base };
        return {
          id: `upload:${u.id}`,
          transactionId: u.id,
          roomId,
          sender: client.getUserId() ?? "",
          senderName: "",
          isOwn: true,
          ts: u.startedAt,
          content,
          status: u.failed ? ("failed" as const) : ("sending" as const),
          upload: {
            progress: u.total ? u.loaded / u.total : 0,
            loaded: u.loaded,
            total: u.total,
            ...(u.previewUrl && { previewUrl: u.previewUrl }),
            ...(u.failed && { failed: true }),
          },
        };
      });
    const compute = () => [...roomItems(client, room), ...uploadItems()];
    let current: TimelineItem[] = compute();
    let pending = false;

    const refresh = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        const next = compute();
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

    /** A message of mine that is waiting to be sent or could not be sent, by its local id. */
    const pendingEvent = (txn: string) => room.getPendingEvents().find((e) => e.getTxnId() === txn);
    const handle: TimelineHandle = {
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
      sendText: (body, mentions) =>
        guard(async () => {
          await client.sendMessage(roomId, { msgtype: "m.text", body, ...mentionBlock(mentions), ...(await linkPreviews(client, body)) } as never);
        }),
      cancelUpload: (id: string) => {
        const u = uploading.get(id);
        if (!u) return;
        u.abort.abort(); // a failed upload has nothing to abort: this just dismisses it
        uploading.delete(id);
        if (u.previewUrl) URL.revokeObjectURL(u.previewUrl);
        refresh();
      },
      resend: (txn: string) =>
        guard(async () => {
          const failedUpload = uploading.get(txn);
          if (failedUpload) {
            if (!failedUpload.failed) return; // still going
            uploading.delete(txn);
            if (failedUpload.previewUrl) URL.revokeObjectURL(failedUpload.previewUrl);
            await handle.sendAttachment(failedUpload.source);
            return;
          }
          const ev = pendingEvent(txn);
          if (!ev) throw new EngineError("not_found", "That message is no longer waiting to be sent");
          await client.resendEvent(ev, room);
        }),
      discard: (txn: string) => {
        if (uploading.has(txn)) return handle.cancelUpload(txn);
        const ev = pendingEvent(txn);
        if (!ev) return;
        client.cancelPendingEvent(ev);
        refresh();
      },
      sendAttachment: (file: AttachmentSource) =>
        guard(async () => {
          const blob = file.data as Blob;
          const kind = kindOf(file.mimeType);
          const id = `upload-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
          const u: Pending = {
            id,
            name: file.name,
            mimeType: file.mimeType,
            size: file.size,
            loaded: 0,
            total: file.size,
            startedAt: Date.now(),
            abort: new AbortController(),
            source: file,
          };
          uploading.set(id, u);
          let lastPaint = 0;
          const paint = (force = false) => {
            const now = Date.now();
            if (force || now - lastPaint > 120) {
              lastPaint = now;
              refresh();
            }
          };
          if (kind === "image" && typeof URL.createObjectURL === "function") u.previewUrl = URL.createObjectURL(blob);
          refresh();
          try {
            // What the browser knows about the file: picture size, play time, and a poster frame for videos.
            let dims: { w?: number | undefined; h?: number | undefined } = { w: file.width, h: file.height };
            let durationMs = file.durationMs;
            let poster: Probe["poster"];
            if (kind === "image" && !dims.w && typeof createImageBitmap === "function") {
              try {
                const bmp = await createImageBitmap(blob);
                dims = { w: bmp.width, h: bmp.height };
                bmp.close();
              } catch {
                /* not decodable: send without size */
              }
            } else if (kind === "video" || kind === "audio") {
              const p = await probeMedia(blob, kind);
              durationMs ??= p.durationMs;
              poster = p.poster;
              if (kind === "video") dims = { w: file.width ?? p.width, h: file.height ?? p.height };
              if (poster && typeof URL.createObjectURL === "function") {
                u.previewUrl = URL.createObjectURL(poster.blob);
                refresh();
              }
            }
            const info: Record<string, unknown> = {
              mimetype: file.mimeType,
              size: file.size,
              ...(dims.w && dims.h && { w: dims.w, h: dims.h }),
              ...(durationMs && { duration: durationMs }),
            };
            const msgtype = kind === "image" ? "m.image" : kind === "video" ? "m.video" : kind === "audio" ? "m.audio" : "m.file";
            const content: Record<string, unknown> = { msgtype, body: file.name, filename: file.name, info };
            if (kind === "audio" && file.voice) {
              content["org.matrix.msc3245.voice"] = {};
              content["org.matrix.msc1767.audio"] = {
                ...(durationMs && { duration: durationMs }),
                ...(file.waveform && { waveform: file.waveform.map((n) => Math.round(Math.max(0, Math.min(1, n)) * 1024)) }),
              };
            }
            const upload = async (body: Blob, name: string, type: string, includeFilename: boolean, track: boolean) =>
              (
                await client.uploadContent(body, {
                  name,
                  type,
                  includeFilename,
                  abortController: u.abort,
                  ...(track && {
                    progressHandler: ({ loaded, total }: { loaded: number; total: number }) => {
                      u.loaded = loaded;
                      if (total) u.total = total;
                      paint();
                    },
                  }),
                })
              ).content_uri;
            if (client.isRoomEncrypted(roomId) || (await client.getCrypto()?.isEncryptionEnabledInRoom(roomId))) {
              const { data, info: enc } = await encryptAttachment(await blob.arrayBuffer());
              content.file = { ...enc, url: await upload(new Blob([data]), file.name, "application/octet-stream", false, true), mimetype: file.mimeType };
              if (poster) {
                const t = await encryptAttachment(await poster.blob.arrayBuffer());
                info.thumbnail_file = {
                  ...t.info,
                  url: await upload(new Blob([t.data]), "poster.jpg", "application/octet-stream", false, false),
                  mimetype: "image/jpeg",
                };
                info.thumbnail_info = { mimetype: "image/jpeg", w: poster.width, h: poster.height, size: poster.blob.size };
              }
            } else {
              content.url = await upload(blob, file.name, file.mimeType, true, true);
              if (poster) {
                info.thumbnail_url = await upload(poster.blob, "poster.jpg", "image/jpeg", true, false);
                info.thumbnail_info = { mimetype: "image/jpeg", w: poster.width, h: poster.height, size: poster.blob.size };
              }
            }
            u.loaded = u.total;
            paint(true);
            const sending = client.sendMessage(roomId, content as never); // its local echo appears now, so the upload row can go
            uploading.delete(id);
            refresh();
            await sending;
          } catch (e) {
            if (u.abort.signal.aborted) throw new EngineError("unknown", "cancelled", e); // cancelUpload already removed it
            u.failed = true;
            refresh(); // stays in the timeline, marked failed, until dismissed
            throw e;
          } finally {
            if (!uploading.has(id) && u.previewUrl) URL.revokeObjectURL(u.previewUrl);
          }
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
      reply: (eventId, body, mentions) =>
        guard(async () => {
          await client.sendMessage(roomId, {
            msgtype: "m.text",
            body,
            ...mentionBlock(mentions),
            "m.relates_to": { "m.in_reply_to": { event_id: eventId } },
          } as never);
        }),
      pin: (eventId, pinned) =>
        guard(async () => {
          const state = room.currentState;
          const current = pinnedIds(room);
          const next = pinned ? [...current.filter((e) => e !== eventId), eventId] : current.filter((e) => e !== eventId);
          await client.sendStateEvent(roomId, EventType.RoomPinnedEvents as never, { events: next } as never, "");
          void state; // the room's own state event updates pinnedIds for the next conversion pass
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
    return handle;
  }
}
