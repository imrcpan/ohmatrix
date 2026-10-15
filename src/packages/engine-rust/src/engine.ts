import {
  diffTimeline,
  EngineError,
  resolveHomeserver,
  reuseRooms,
  type AttachmentSource,
  type AuthApi,
  type HistoryVisibility,
  type IncomingNotification,
  type MemberRole,
  type PowerThresholds,
  type RoomDetails,
  type ListUpdate,
  type Listener,
  type MatrixEngine,
  type MediaKind,
  type MediaOptions,
  type Profile,
  type RoomSummary,
  type SearchPage,
  type SecurityState,
  type Session,
  type SharedMediaPage,
  type SpaceChild,
  type SyncApi,
  type SyncState,
  type TimelineHandle,
  type TimelineItem,
  type Unsubscribe,
} from "@ohmatrix/core";
import { guard, toEngineError } from "./errors.js";
import { compareRooms, isListed, toRoomSummary } from "./roomSummary.js";
import { orderFor, putState, readChildren, toSpaceChild } from "./spaces.js";
import { addAlias, removeAlias, setMainAlias, type Aliases } from "./aliases.js";
import { readStatus, register, writeStatus } from "./account.js";
import { listDevices, removeDevices, type Account, type Fetch } from "./devices.js";
import { attachmentKind, forwardContent, pathOf } from "./forward.js";
import { personName } from "./serviceText.js";
import type { EventRef, LatestEvent, Sdk, SdkClient, SdkRoom, SdkSearch, SdkSyncService, SdkTask, SdkTimeline, TimelineEntry } from "./sdk.js";
import { securityStateOf } from "./security.js";
import { toRoomDetails } from "./roomDetails.js";
import { fromSession, toSession } from "./session.js";
import { toTimelineItem } from "./timelineItem.js";
import { fromSdkDiff, fromVectorDiff, type VectorDiff } from "./vectorDiff.js";

/** What the engine needs from the app that hosts it. */
export interface RustEngineOptions {
  /** A folder in the app's private storage for the SDK's database. */
  dataDir: string;
  /** A folder for what can be fetched again (downloaded media). */
  cacheDir: string;
  /** The passphrase of the database, the same every time (see the app's secure storage). */
  passphrase(): Promise<string>;
  /** Read a file of the device (a picked picture, for a profile picture). */
  readFile?(path: string): Promise<ArrayBuffer>;
  /** For the requests the SDK cannot make (the list of sessions); the platform's `fetch` when not given. */
  fetch?: Fetch;
}

/** The name the SDK shows for this device in the list of sessions. */
const DEVICE_NAME = "OhMatrix Android";

const SYNC_STATE: Record<string, SyncState> = { Idle: "stopped", Running: "syncing", Terminated: "stopped", Error: "error", Offline: "connecting" };

/** The power level each role stands for. */
const ROLE_POWER: Record<MemberRole, number> = { admin: 100, moderator: 50, member: 0 };

const unsupported = (what: string) => new EngineError("unsupported", `${what} is not available here`);

/**
 * `MatrixEngine` over matrix-rust-sdk. `sdk` is how the SDK is reached: the real bindings in the app
 * (`sdkFromBindings`), a fake in tests. What the platform cannot do fails with `unsupported`, which the app already
 * treats as "this engine cannot do that".
 */
export class RustEngineCore implements MatrixEngine {
  private client: SdkClient | null = null;
  private syncService: SdkSyncService | null = null;
  private tasks: SdkTask[] = [];
  private syncState: SyncState = "stopped";
  private readonly syncListeners = new Set<Listener<SyncState>>();
  /** Things that look again when the list of chats changes (the pages of spaces). */
  private readonly listWatchers = new Set<() => void>();
  private readonly roomListeners = new Set<Listener<ListUpdate<RoomSummary>[]>>();
  private readonly profileListeners = new Set<Listener<Profile | null>>();
  private lastProfile: Profile | null = null;
  /** Re-reads of the open chat-info pages, keyed by room: muting is a notification setting, so the room does not announce it. */
  private readonly detailRefreshers = new Map<string, Set<() => void>>();
  private rooms_ = new RoomList();
  private roomsTask: (SdkTask & { loadMore(): void }) | null = null;

  constructor(
    private readonly sdk: Sdk,
    private readonly options: RustEngineOptions,
  ) {}

  private need(): SdkClient {
    if (!this.client) throw new EngineError("unauthorized", "not signed in");
    return this.client;
  }

  private setSync(s: SyncState) {
    this.syncState = s;
    this.syncListeners.forEach((cb) => cb(s));
  }

  private async makeClient(homeserver: string): Promise<SdkClient> {
    return this.sdk.newClient({
      homeserverUrl: homeserver,
      dataDir: this.options.dataDir,
      cacheDir: this.options.cacheDir,
      passphrase: await this.options.passphrase(),
    });
  }

  /** Forget the signed-in client and everything hanging off it. */
  private reset() {
    for (const t of this.tasks.splice(0)) t.cancel();
    this.roomsTask?.cancel();
    this.roomsTask = null;
    this.syncService = null;
    this.client = null;
    this.rooms_ = new RoomList();
    this.lastProfile = null;
    for (const g of this.galleries.values()) g.close();
    this.galleries.clear();
    this.mediaUrls.clear();
    this.searches.clear();
    this.spaceViews.clear();
    this.securityTask?.cancel();
    this.securityTask = null;
    this.setSecurity("unavailable");
    this.profileListeners.forEach((cb) => cb(null));
    this.roomListeners.forEach((cb) => cb([{ op: "reset", items: [] }]));
    this.setSync("stopped");
  }

  private async loadProfile() {
    const c = this.client;
    if (!c) return;
    try {
      const p = await c.profile();
      const id = c.userId();
      const status = await readStatus(this.fetch(), this.account()).catch(() => undefined);
      this.lastProfile = {
        userId: id,
        displayName: p.displayName || id.replace(/^@/, "").replace(/:.*$/, ""),
        ...(p.avatarUrl && { avatar: p.avatarUrl }),
        ...(status && { status }),
      };
      this.profileListeners.forEach((cb) => cb(this.lastProfile));
    } catch {
      /* keep what there was */
    }
  }

  readonly auth: AuthApi = {
    loginWithPassword: (homeserver, username, password) =>
      guard(async () => {
        const client = await this.makeClient(homeserver);
        await client.login(username, password, DEVICE_NAME);
        this.client = client;
        void this.loadProfile();
        this.watchSecurity();
        return toSession(client.session());
      }),
    register: (homeserver: string, username: string, password: string) =>
      guard(async () => {
        const session = await register(this.fetch(), await resolveHomeserver(homeserver), username, password, DEVICE_NAME);
        await this.auth.restore(session);
        return session;
      }),
    restore: (session: Session) =>
      guard(async () => {
        const client = await this.makeClient(session.homeserver);
        await client.restore(fromSession(session, this.sdk.defaultSlidingSync));
        this.client = client;
        void this.loadProfile();
        this.watchSecurity();
      }),
    logout: () =>
      guard(async () => {
        const c = this.client;
        try {
          await this.syncService?.stop();
          await c?.logout();
        } finally {
          this.reset();
        }
      }),
  };

  readonly sync: SyncApi = {
    start: () =>
      guard(async () => {
        const c = this.need();
        this.syncService ??= await c.syncService();
        const s = this.syncService;
        this.tasks.push(s.onState((st) => this.setSync(SYNC_STATE[st] ?? "error")));
        this.roomsTask ??= await s.rooms((changes) => this.onRoomChanges(changes));
        await s.start();
      }),
    stop: () => guard(async () => void (await this.syncService?.stop())),
    onState: (cb) => {
      this.syncListeners.add(cb);
      cb(this.syncState);
      return () => void this.syncListeners.delete(cb);
    },
  };

  // ---- the chat list ---------------------------------------------------------------------------------------------

  /**
   * The SDK delivers the list as changes over its own order, and a row needs more than the list holds (the room's info
   * and its newest event, both asked for). So the changes are applied to a list of rooms, each room's summary is made
   * and kept up to date, and the whole list is handed on in our order.
   */
  private onRoomChanges(changes: { tag: string; inner?: { values?: SdkRoom[]; value?: SdkRoom; index?: number; length?: number } | undefined }[]) {
    const diffs = changes.map((c) => fromSdkDiff<SdkRoom>(c));
    const added = this.rooms_.apply(diffs);
    for (const room of added) void this.watchRoom(room);
    this.emitRooms();
  }

  private async watchRoom(room: SdkRoom) {
    const refresh = async () => {
      try {
        const info = await room.info();
        const latest: LatestEvent = await room.latest().catch((): LatestEvent => ({}));
        const last = latest.item ? asItem(latest.item, room.id(), this.client?.userId() ?? "") : undefined;
        const summary = isListed(info.membership)
          ? toRoomSummary(info, latest.item ? { lastActivityTs: latest.item.timestamp, ...(last && { lastMessage: last }) } : undefined)
          : null;
        const before = this.rooms_.get(room.id());
        if (this.rooms_.setSummary(room.id(), summary)) {
          if (before && summary) this.notifyOf(before, summary);
          this.emitRooms();
        }
      } catch {
        /* the room is gone, or the SDK is not ready: the next change tries again */
      }
    };
    this.tasks.push(room.onInfo(() => void refresh()));
    await refresh();
  }

  /** A room whose unread count went up has a new message that should be told of (unless the room is muted). */
  private notifyOf(before: RoomSummary, now: RoomSummary) {
    if (now.muted || now.invite || now.unreadCount <= before.unreadCount) return;
    const last = now.lastMessage;
    const text =
      last?.content.kind === "text"
        ? last.content.body
        : last?.content.kind === "image"
          ? last.content.body
          : last && "name" in last.content
            ? last.content.name
            : undefined;
    const note: IncomingNotification = {
      eventId: last?.id ?? "",
      roomId: now.id,
      roomName: now.name,
      isDirect: now.isDirect,
      senderName: last?.senderName ?? "",
      ...(text && { preview: text }),
      highlight: now.highlightCount > before.highlightCount,
    };
    this.noticeListeners.forEach((cb) => cb(note));
  }

  private readonly noticeListeners = new Set<Listener<IncomingNotification>>();

  private emitRooms() {
    const items = this.rooms_.list();
    const updates: ListUpdate<RoomSummary>[] = [{ op: "reset", items }];
    this.roomListeners.forEach((cb) => cb(updates));
    this.listWatchers.forEach((w) => w());
  }

  readonly rooms = {
    subscribe: (cb: Listener<ListUpdate<RoomSummary>[]>): Unsubscribe => {
      this.roomListeners.add(cb);
      cb([{ op: "reset", items: this.rooms_.list() }]);
      return () => void this.roomListeners.delete(cb);
    },
    leave: (roomId: string) => guard(() => this.room(roomId).leave()),
    acceptInvite: (roomId: string) => guard(() => this.room(roomId).join()),
    // Declining is leaving a room one is only invited to.
    declineInvite: (roomId: string) => guard(() => this.room(roomId).leave()),
    setPinned: (roomId: string, pinned: boolean) => guard(() => this.room(roomId).setFavourite(pinned)),
    setMarkedUnread: (roomId: string, unread: boolean) => guard(() => this.room(roomId).setUnreadFlag(unread)),
    markRead: (roomId: string) => guard(() => this.room(roomId).markRead()),
    setMuted: (roomId: string, muted: boolean) =>
      guard(async () => {
        await this.need().setMuted(roomId, muted);
        this.detailRefreshers.get(roomId)?.forEach((refresh) => refresh());
      }),
    createDirect: (userId: string) =>
      guard(async () => {
        const c = this.need();
        return c.directRoom(userId) ?? (await c.createRoom({ name: "", invite: [userId], encrypted: true, space: false, direct: true }));
      }),
    createGroup: (opts: { name: string; invite: string[] }) =>
      guard(() => this.need().createRoom({ name: opts.name, invite: opts.invite, encrypted: true, space: false, direct: false })),
    createSpace: (opts: { name: string; topic?: string; invite?: string[] }) =>
      guard(() =>
        this.need().createRoom({
          name: opts.name,
          ...(opts.topic !== undefined && { topic: opts.topic }),
          invite: opts.invite ?? [],
          encrypted: false,
          space: true,
          direct: false,
        }),
      ),
    joinRoom: (idOrAlias: string) => guard(() => this.need().joinRoom(idOrAlias.trim())),
    subscribeDetails: (roomId: string, cb: Listener<RoomDetails>): Unsubscribe => {
      const room = this.room(roomId);
      let live = true;
      let busy = false;
      let again = false;
      // Changes arrive in bursts (a member joins: info, members, levels); one read at a time, and one more after it.
      const refresh = async () => {
        if (busy) {
          again = true;
          return;
        }
        busy = true;
        try {
          do {
            again = false;
            const details = toRoomDetails(await room.details());
            if (live) cb(details);
          } while (again && live);
        } catch {
          /* the room is gone, or the SDK is not ready: the next change tries again */
        } finally {
          busy = false;
        }
      };
      const task = room.onInfo(() => void refresh());
      const nudge = () => void refresh();
      const set = this.detailRefreshers.get(roomId) ?? new Set<() => void>();
      set.add(nudge);
      this.detailRefreshers.set(roomId, set);
      void refresh();
      return () => {
        live = false;
        set.delete(nudge);
        task.cancel();
      };
    },
  };

  /** Pictures and files already fetched, by what they were asked for: the same one is often asked for many times. */
  private readonly mediaUrls = new Map<string, Promise<string>>();
  /** One timeline per room, kept for the gallery: it reads back further than the chat does. */
  private readonly galleries = new Map<string, RustTimeline>();

  readonly media = {
    resolve: (mxc: string, opts: MediaOptions = {}): Promise<string> => {
      const key = [mxc, opts.width, opts.height, opts.encryption ? "enc" : ""].join("|");
      let url = this.mediaUrls.get(key);
      if (!url) {
        url = guard(() =>
          this.need().mediaUrl(mxc, {
            ...(typeof opts.encryption === "string" && { source: opts.encryption }),
            ...(opts.width && opts.height && { width: opts.width, height: opts.height }),
            ...(opts.mimeType && { mimeType: opts.mimeType }),
          }),
        );
        this.mediaUrls.set(key, url);
        // A failure is not kept: the next ask tries again.
        url.catch(() => this.mediaUrls.delete(key));
      }
      return url;
    },
    sharedPage: (roomId: string, opts: { kind: MediaKind; from?: string; want?: number }): Promise<SharedMediaPage> =>
      guard(async () => {
        let gallery = this.galleries.get(roomId);
        if (!gallery) {
          gallery = new RustTimeline(this.room(roomId), roomId, this.need().userId());
          gallery.subscribe(() => {});
          this.galleries.set(roomId, gallery);
        }
        const want = opts.want ?? 30;
        const offset = opts.from ? Number(opts.from) || 0 : 0;
        const found = () =>
          gallery
            .current()
            .filter((i) => i.content.kind === opts.kind)
            .reverse();
        await gallery.ready();
        // Ask the room for more until it has what the page needs (and one more, to know whether there is a next page).
        for (let n = 0; found().length <= offset + want && !gallery.atStart && n < 40; n++) await gallery.paginateBackwards();
        const all = found();
        const more = all.length > offset + want || !gallery.atStart;
        return { items: all.slice(offset, offset + want), ...(more && { next: String(offset + want) }) };
      }),
  };
  readonly messages = {
    forward: (p: { fromRoomId: string; eventId: string; toRoomId: string }) =>
      guard(async () => {
        const from = new RustTimeline(this.room(p.fromRoomId), p.fromRoomId, this.need().userId());
        try {
          const item = await from.item(p.eventId);
          const content = forwardContent(item);
          if (!content) throw new EngineError("unsupported", "This message cannot be forwarded");
          await this.room(p.toRoomId).sendRaw("m.room.message", JSON.stringify(content));
        } finally {
          from.close();
        }
      }),
  };
  private readonly securityListeners = new Set<Listener<SecurityState>>();
  private lastSecurity: SecurityState = "unavailable";
  private securityTask: SdkTask | null = null;

  private setSecurity(state: SecurityState) {
    if (state === this.lastSecurity) return;
    this.lastSecurity = state;
    this.securityListeners.forEach((cb) => cb(state));
  }

  /** Follow the signed-in client's encryption state (once per client). */
  private watchSecurity() {
    const c = this.client;
    if (!c || this.securityTask || !this.securityListeners.size) return;
    const security = c.security();
    const look = () =>
      void security
        .read()
        .then((raw) => this.client === c && this.setSecurity(securityStateOf(raw)))
        .catch(() => {});
    this.securityTask = security.onChange(look);
    look();
  }

  /** The pages open on a space, each with the read that brings it up to date. */
  private readonly spaceViews = new Map<string, Set<() => void>>();

  private refreshSpace(spaceId: string) {
    this.spaceViews.get(spaceId)?.forEach((refresh) => refresh());
  }

  private async childrenOf(spaceId: string): Promise<SpaceChild[]> {
    const kids = await readChildren(this.fetch(), this.account(), spaceId);
    return kids.map((k) => toSpaceChild(k, this.rooms_.get(k.roomId)));
  }

  readonly spaces = {
    children: (spaceId: string) => guard(() => this.childrenOf(spaceId)),
    subscribe: (spaceId: string, cb: Listener<SpaceChild[]>): Unsubscribe => {
      let live = true;
      let busy = false;
      let again = false;
      const refresh = () => {
        if (busy) {
          again = true;
          return;
        }
        busy = true;
        void (async () => {
          try {
            do {
              again = false;
              const kids = await this.childrenOf(spaceId);
              if (live) cb(kids);
            } while (again && live);
          } catch {
            /* the server could not be reached: the next change tries again */
          } finally {
            busy = false;
          }
        })();
      };
      const views = this.spaceViews.get(spaceId) ?? new Set<() => void>();
      views.add(refresh);
      this.spaceViews.set(spaceId, views);
      // Names and counts are in my own list, so a change of the list is a reason to look again.
      this.listWatchers.add(refresh);
      refresh();
      return () => {
        live = false;
        views.delete(refresh);
        this.listWatchers.delete(refresh);
      };
    },
    addChild: (spaceId: string, roomId: string, via?: string) =>
      guard(async () => {
        const f = this.fetch();
        const a = this.account();
        const domain = via ?? a.userId.split(":").slice(1).join(":");
        const order = orderFor(await readChildren(f, a, spaceId), roomId, "last");
        await putState(f, a, spaceId, "m.space.child", roomId, { order, via: [domain] });
        // The child records its parent too, so clients can nest it in a tree without reading the space.
        await putState(f, a, roomId, "m.space.parent", spaceId, { via: [domain] }).catch(() => {});
        this.refreshSpace(spaceId);
      }),
    removeChild: (spaceId: string, roomId: string) =>
      guard(async () => {
        const f = this.fetch();
        const a = this.account();
        await putState(f, a, spaceId, "m.space.child", roomId, {});
        await putState(f, a, roomId, "m.space.parent", spaceId, {}).catch(() => {});
        this.refreshSpace(spaceId);
      }),
    moveChild: (spaceId: string, roomId: string, to: "first" | "last") =>
      guard(async () => {
        const f = this.fetch();
        const a = this.account();
        const kids = await readChildren(f, a, spaceId);
        const current = kids.find((k) => k.roomId === roomId);
        if (!current) throw new EngineError("not_found", `${roomId} is not in the space`);
        await putState(f, a, spaceId, "m.space.child", roomId, { order: orderFor(kids, roomId, to), via: current.via });
        this.refreshSpace(spaceId);
      }),
    candidates: (spaceId: string) =>
      guard(async () => {
        const inSpace = new Set((await readChildren(this.fetch(), this.account(), spaceId)).map((k) => k.roomId));
        return this.rooms_
          .list()
          .filter((r) => !r.invite && !r.isSpace && !r.isDirect && !inSpace.has(r.id))
          .map((r): SpaceChild => ({
            roomId: r.id,
            name: r.name,
            ...(r.avatar && { avatar: r.avatar }),
            isSpace: false,
            unreadCount: r.unreadCount,
            highlightCount: r.highlightCount,
          }))
          .sort((x, y) => x.name.localeCompare(y.name));
      }),
  };
  readonly security = {
    state: (): Promise<SecurityState> => guard(async () => (this.client ? securityStateOf(await this.client.security().read()) : "unavailable")),
    onState: (cb: Listener<SecurityState>): Unsubscribe => {
      // The app subscribes before anyone has signed in; the state follows the client that signs in later.
      this.securityListeners.add(cb);
      cb(this.lastSecurity);
      this.watchSecurity();
      return () => void this.securityListeners.delete(cb);
    },
    setUp: (opts: { password: string }) => guard(async () => ({ recoveryKey: await this.need().security().setUp(opts.password) })),
    restoreWithRecoveryKey: (key: string) => guard(() => this.need().security().recover(key.trim())),
  };
  readonly roomAdmin = {
    setName: (roomId: string, name: string) => guard(() => this.room(roomId).setName(name)),
    setTopic: (roomId: string, topic: string) => guard(() => this.room(roomId).setTopic(topic)),
    setAvatar: (roomId: string, file: AttachmentSource) =>
      guard(async () => {
        const room = this.room(roomId);
        await room.setAvatar(file.mimeType, await this.read(file));
      }),
    invite: (roomId: string, userIds: string[]) =>
      guard(async () => {
        const room = this.room(roomId);
        for (const id of userIds) await room.invite(id);
      }),
    kick: (roomId: string, userId: string) => guard(() => this.room(roomId).kick(userId)),
    setRole: (roomId: string, userId: string, role: MemberRole) => guard(() => this.room(roomId).setPower(userId, ROLE_POWER[role])),
    setPower: (roomId: string, userId: string, level: number) => guard(() => this.room(roomId).setPower(userId, level)),
    setThresholds: (roomId: string, patch: Partial<PowerThresholds>) =>
      guard(async () => {
        const room = this.room(roomId);
        // Changing settings and changing levels share the SDK's state default, so the two cannot differ here.
        const state = patch.changeSettings ?? patch.changeLevels;
        await room.setLevels({
          ...(patch.invite !== undefined && { invite: patch.invite }),
          ...(patch.kick !== undefined && { kick: patch.kick }),
          ...(patch.ban !== undefined && { ban: patch.ban }),
          ...(patch.redact !== undefined && { redact: patch.redact }),
          ...(patch.sendMessages !== undefined && { eventsDefault: patch.sendMessages }),
          ...(state !== undefined && { stateDefault: state }),
        });
      }),
    ban: (roomId: string, userId: string, reason?: string) => guard(() => this.room(roomId).ban(userId, reason)),
    unban: (roomId: string, userId: string) => guard(() => this.room(roomId).unban(userId)),
    setHistoryVisibility: (roomId: string, visibility: HistoryVisibility) => guard(() => this.room(roomId).setHistoryVisibility(visibility)),
    setJoinRule: (roomId: string, rule: "public" | "invite") => guard(() => this.room(roomId).setJoinRule(rule)),
    addAlias: (roomId: string, localpart: string) => guard(async () => addAlias(this.fetch(), this.account(), roomId, localpart, await this.aliasesOf(roomId))),
    removeAlias: (roomId: string, alias: string) => guard(async () => removeAlias(this.fetch(), this.account(), roomId, alias, await this.aliasesOf(roomId))),
    setMainAlias: (roomId: string, alias: string) => guard(async () => setMainAlias(this.fetch(), this.account(), roomId, alias, await this.aliasesOf(roomId))),
  };
  private readonly searches = new Map<string, SdkSearch>();
  private searchCount = 0;

  readonly search = {
    messages: (o: { term: string; roomId?: string; from?: string }): Promise<SearchPage> =>
      guard(async () => {
        const known = o.from ? this.searches.get(o.from) : undefined;
        if (o.from && !known) return { results: [], localRooms: 0 };
        const search = known ?? this.need().search(o.term.trim(), o.roomId);
        const hits = (await search.next()) ?? [];
        let next: string | undefined;
        if (hits.length) {
          next = o.from ?? `s${++this.searchCount}`;
          this.searches.set(next, search);
          // Only the latest few searches are kept.
          for (const old of [...this.searches.keys()].slice(0, -12)) this.searches.delete(old);
        } else if (o.from) this.searches.delete(o.from);
        const results = hits.map((h) => ({
          eventId: h.eventId,
          roomId: h.roomId,
          roomName: this.rooms_.name(h.roomId),
          sender: h.sender,
          senderName: personName(h.senderName, h.sender),
          ts: h.ts,
          text: h.text,
          local: false,
        }));
        return { results, ...(next && { next }), localRooms: 0 };
      }),
  };
  readonly devices = {
    list: () => guard(() => listDevices(this.fetch(), this.account())),
    remove: (ids: string[], password: string) => guard(() => removeDevices(this.fetch(), this.account(), ids, password)),
  };
  readonly users = {
    search: (term: string) =>
      guard(async () => {
        const c = this.need();
        const me = c.userId();
        const q = term.trim();
        if (!q) return [];
        const found = (await c.searchUsers(q, 20)).filter((p) => p.userId !== me);
        // A complete user id the directory does not list is looked up directly, so anyone on the network can be reached.
        if (/^@[^:\s]+:[^\s]+$/.test(q) && q !== me && !found.some((p) => p.userId === q)) {
          const p = await c.userProfile(q).catch(() => undefined);
          if (p) found.unshift(p);
        }
        return found.map((p) => ({
          userId: p.userId,
          displayName: p.displayName || p.userId.replace(/^@/, "").replace(/:.*$/, ""),
          ...(p.avatarUrl && { avatar: p.avatarUrl }),
        }));
      }),
  };
  readonly notifications = {
    subscribe: (cb: Listener<IncomingNotification>): Unsubscribe => {
      this.noticeListeners.add(cb);
      return () => void this.noticeListeners.delete(cb);
    },
  };

  // ---- everything else -------------------------------------------------------------------------------------------

  readonly profile = {
    subscribe: (cb: Listener<Profile | null>) => {
      this.profileListeners.add(cb);
      cb(this.lastProfile);
      return () => void this.profileListeners.delete(cb);
    },
    setDisplayName: (name: string) =>
      guard(async () => {
        await this.need().setDisplayName(name);
        await this.loadProfile();
      }),
    setAvatar: (file: AttachmentSource) =>
      guard(async () => {
        await this.need().setAvatar(file.mimeType, await this.read(file));
        await this.loadProfile();
      }),
    setStatus: (status: string) =>
      guard(async () => {
        await writeStatus(this.fetch(), this.account(), status);
        await this.loadProfile();
      }),
  };

  /** The addresses a room lists now. */
  private async aliasesOf(roomId: string): Promise<Aliases> {
    const d = await this.room(roomId).details();
    return { main: d.canonicalAlias, others: d.alternativeAliases };
  }

  private fetch(): Fetch {
    return this.options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  }

  /** Who I am to the homeserver, for the few requests the SDK has no call for. */
  private account(): Account {
    const s = this.need().session();
    return { homeserverUrl: s.homeserverUrl, accessToken: s.accessToken, userId: s.userId, deviceId: s.deviceId };
  }

  /** The bytes of a picked file. */
  private async read(file: AttachmentSource): Promise<ArrayBuffer> {
    if (file.data instanceof ArrayBuffer) return file.data;
    if (!this.options.readFile) throw unsupported("Reading files");
    return this.options.readFile(pathOf(file.data));
  }

  private room(roomId: string): SdkRoom {
    const room = this.need().room(roomId);
    if (!room) throw new EngineError("not_found", `unknown room ${roomId}`);
    return room;
  }

  openTimeline(roomId: string): TimelineHandle {
    const room = this.room(roomId);
    return new RustTimeline(room, roomId, this.need().userId());
  }
}

/** The rooms of the list, each with its summary once it is known. */
class RoomList {
  private order: SdkRoom[] = [];
  private summaries = new Map<string, RoomSummary>();
  private last: RoomSummary[] = [];

  /** Apply the SDK's changes; returns the rooms that are new to the list. */
  apply(diffs: VectorDiff<SdkRoom>[]): SdkRoom[] {
    const before = new Set(this.order.map((r) => r.id()));
    const size = { n: this.order.length };
    for (const u of fromVectorDiff(diffs, size, (r) => r)) {
      if (u.op === "reset") this.order = [...u.items];
      else if (u.op === "insert") this.order.splice(u.index, 0, u.item);
      else if (u.op === "set") this.order[u.index] = u.item;
      else if (u.op === "remove") this.order.splice(u.index, 1);
    }
    const now = new Set(this.order.map((r) => r.id()));
    for (const id of [...this.summaries.keys()]) if (!now.has(id)) this.summaries.delete(id);
    return this.order.filter((r) => !before.has(r.id()));
  }

  /** A room's summary, when it is listed. */
  get(id: string): RoomSummary | undefined {
    return this.summaries.get(id);
  }

  /** The name a room is listed by (its id when it is not known). */
  name(id: string): string {
    return this.summaries.get(id)?.name ?? id;
  }

  /** Remember a room's summary (null: it is not listed). Returns whether the list changed. */
  setSummary(id: string, s: RoomSummary | null): boolean {
    if (!this.order.some((r) => r.id() === id)) return false;
    if (s) this.summaries.set(id, s);
    else this.summaries.delete(id);
    return true;
  }

  /** The list in our order, with the object of every room that did not change kept. */
  list(): RoomSummary[] {
    const rooms = this.order.map((r) => this.summaries.get(r.id())).filter((s): s is RoomSummary => !!s);
    this.last = reuseRooms(this.last, rooms.sort(compareRooms));
    return this.last;
  }
}

/** The newest event of a room as the `TimelineItem` a row previews. */
function asItem(e: Parameters<typeof toTimelineItem>[0], roomId: string, me: string): TimelineItem | undefined {
  return toTimelineItem(e, roomId, me) ?? undefined;
}

/** One open room: its messages as our items, and sending into it. */
class RustTimeline implements TimelineHandle {
  readonly firstUnreadEventId = null;
  private entries: TimelineEntry[] = [];
  private items: TimelineItem[] = [];
  private readonly listeners = new Set<Listener<ListUpdate<TimelineItem>[]>>();
  private timeline: Promise<SdkTimeline>;
  private task: Promise<SdkTask> | null = null;
  private typingTask: SdkTask | null = null;
  private closed = false;

  constructor(
    private readonly room: SdkRoom,
    private readonly roomId: string,
    private readonly me: string,
  ) {
    this.timeline = room.timeline();
    this.task = this.timeline.then((t) => t.onChanges((changes) => this.onChanges(changes)));
    this.task.catch(() => {});
  }

  private onChanges(changes: { tag: string; inner?: { values?: TimelineEntry[]; value?: TimelineEntry; index?: number; length?: number } | undefined }[]) {
    if (this.closed) return;
    const size = { n: this.entries.length };
    for (const u of fromVectorDiff(
      changes.map((c) => fromSdkDiff<TimelineEntry>(c)),
      size,
      (e) => e,
    )) {
      if (u.op === "reset") this.entries = [...u.items];
      else if (u.op === "insert") this.entries.splice(u.index, 0, u.item);
      else if (u.op === "set") this.entries[u.index] = u.item;
      else if (u.op === "remove") this.entries.splice(u.index, 1);
    }
    // Some entries are not ours to show (day dividers, the read marker): the items are what is left, and the changes
    // are worked out between the two lists, since the indexes of the SDK's list do not hold for ours.
    const next = this.entries.flatMap((e) => (e.event ? [toTimelineItem(e.event, this.roomId, this.me)] : [])).filter((i): i is TimelineItem => !!i);
    const updates = diffTimeline(this.items, next);
    this.items = next;
    if (updates.length) this.listeners.forEach((cb) => cb(updates));
  }

  subscribe(cb: Listener<ListUpdate<TimelineItem>[]>): Unsubscribe {
    this.listeners.add(cb);
    cb([{ op: "reset", items: [...this.items] }]);
    return () => void this.listeners.delete(cb);
  }

  /** The start of the room has been read. */
  atStart = false;
  paginateBackwards = () =>
    guard(async () => {
      this.atStart = await (await this.timeline).paginateBackwards(30);
    });
  /** The items as they are now. */
  current = (): TimelineItem[] => this.items;
  /** Resolves when the timeline has been opened and its first batch has arrived. */
  ready = () => this.task!.then(() => {});
  /** An event of this room, as the chat shows it; `item` rather than `TimelineItem`, since a forward needs what the chat drops. */
  item = (eventId: string) => guard(async () => (await this.timeline).item(eventId));
  sendText = (body: string, mentions?: string[]) => guard(async () => (await this.timeline).sendText(body, mentions));
  markRead = () => guard(async () => (await this.timeline).markRead());

  setTyping(typing: boolean) {
    void this.room.typingNotice(typing).catch(() => {});
  }
  onTyping(cb: Listener<string[]>): Unsubscribe {
    this.typingTask?.cancel();
    this.typingTask = this.room.onTyping((ids) => cb(ids.filter((id) => id !== this.me).map((id) => id.replace(/^@/, "").replace(/:.*$/, ""))));
    cb([]);
    return () => this.typingTask?.cancel();
  }

  /** Which id an item answers to: a message the server has by its event id, one that is still local by its transaction id. */
  private refOf(id: string): EventRef {
    const item = this.items.find((i) => i.id === id);
    return item && item.status !== "sent" && item.transactionId ? { transactionId: item.transactionId } : { eventId: id };
  }

  edit = (eventId: string, body: string) => guard(async () => (await this.timeline).edit(this.refOf(eventId), body));
  redact = (eventId: string) => guard(async () => (await this.timeline).redact(this.refOf(eventId)));
  sendAttachment = (file: AttachmentSource) =>
    guard(async () =>
      (await this.timeline).sendMedia({
        kind: attachmentKind(file),
        path: pathOf(file.data),
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        ...(file.width !== undefined && { width: file.width }),
        ...(file.height !== undefined && { height: file.height }),
        ...(file.durationMs !== undefined && { durationMs: file.durationMs }),
        ...(file.waveform && { waveform: file.waveform }),
        ...(file.voice && { voice: true }),
      }),
    ).catch((e: unknown) => {
      // The chat swallows this (the file just does not show up), so say why somewhere a developer can read.
      console.warn("sending a file failed:", e instanceof Error ? e.message : String(e));
      throw e;
    });
  // Dismissing a local echo of an upload stops the upload.
  cancelUpload = (id: string) => void this.redact(id).catch(() => {});
  // The SDK keeps a failed message in the room's send queue and sends it again when the queue is switched on.
  resend = (_id: string) => guard(() => this.room.retrySending());
  discard = (id: string) => void this.redact(id).catch(() => {});
  reply = (eventId: string, body: string, mentions?: string[]) => guard(async () => (await this.timeline).reply(eventId, body, mentions));
  pin = (eventId: string, pinned: boolean) => guard(async () => (await this.timeline).pin(eventId, pinned));
  react = (eventId: string, key: string) => guard(async () => (await this.timeline).react(this.refOf(eventId), key));

  close() {
    this.closed = true;
    this.listeners.clear();
    this.typingTask?.cancel();
    void this.task?.then((t) => t.cancel()).catch(() => {});
  }
}

export { toEngineError };
