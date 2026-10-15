import {
  diffTimeline,
  EngineError,
  reuseRooms,
  type AuthApi,
  type HistoryVisibility,
  type MemberRole,
  type PowerThresholds,
  type RoomDetails,
  type ListUpdate,
  type Listener,
  type MatrixEngine,
  type Profile,
  type RoomSummary,
  type Session,
  type SyncApi,
  type SyncState,
  type TimelineHandle,
  type TimelineItem,
  type Unsubscribe,
} from "@ohmatrix/core";
import { guard, toEngineError } from "./errors.js";
import { compareRooms, isListed, toRoomSummary } from "./roomSummary.js";
import type { LatestEvent, Sdk, SdkClient, SdkRoom, SdkSyncService, SdkTask, SdkTimeline, TimelineEntry } from "./sdk.js";
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
}

/** The name the SDK shows for this device in the list of sessions. */
const DEVICE_NAME = "OhMatrix Android";

const SYNC_STATE: Record<string, SyncState> = { Idle: "stopped", Running: "syncing", Terminated: "stopped", Error: "error", Offline: "connecting" };

/** The power level each role stands for. */
const ROLE_POWER: Record<MemberRole, number> = { admin: 100, moderator: 50, member: 0 };

const unsupported = (what: string) => new EngineError("unsupported", `${what} is not available in the native engine yet`);

/** A subscription that does nothing, for the places the app subscribes at start and a failure would only hide a screen. */
const noSubscription = (): Unsubscribe => () => {};

/** A method that is not implemented yet: it fails as `unsupported`, so the app can tell and carry on. */
const unsupportedAsync =
  (what: string) =>
  async (..._args: unknown[]): Promise<never> => {
    throw unsupported(what);
  };

/**
 * `MatrixEngine` over matrix-rust-sdk. `sdk` is how the SDK is reached: the real bindings in the app
 * (`sdkFromBindings`), a fake in tests. What is not implemented yet fails with `unsupported`, which the app already
 * treats as "this engine cannot do that".
 */
export class RustEngineCore implements MatrixEngine {
  private client: SdkClient | null = null;
  private syncService: SdkSyncService | null = null;
  private tasks: SdkTask[] = [];
  private syncState: SyncState = "stopped";
  private readonly syncListeners = new Set<Listener<SyncState>>();
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
      this.lastProfile = { userId: id, displayName: p.displayName || id.replace(/^@/, "").replace(/:.*$/, ""), ...(p.avatarUrl && { avatar: p.avatarUrl }) };
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
        return toSession(client.session());
      }),
    register: async () => {
      throw unsupported("Registration");
    },
    restore: (session: Session) =>
      guard(async () => {
        const client = await this.makeClient(session.homeserver);
        await client.restore(fromSession(session, this.sdk.defaultSlidingSync));
        this.client = client;
        void this.loadProfile();
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
        if (this.rooms_.setSummary(room.id(), summary)) this.emitRooms();
      } catch {
        /* the room is gone, or the SDK is not ready: the next change tries again */
      }
    };
    this.tasks.push(room.onInfo(() => void refresh()));
    await refresh();
  }

  private emitRooms() {
    const items = this.rooms_.list();
    const updates: ListUpdate<RoomSummary>[] = [{ op: "reset", items }];
    this.roomListeners.forEach((cb) => cb(updates));
  }

  readonly rooms = {
    subscribe: (cb: Listener<ListUpdate<RoomSummary>[]>): Unsubscribe => {
      this.roomListeners.add(cb);
      cb([{ op: "reset", items: this.rooms_.list() }]);
      return () => void this.roomListeners.delete(cb);
    },
    leave: (roomId: string) => guard(() => this.room(roomId).leave()),
    acceptInvite: unsupportedAsync("Accepting an invitation"),
    declineInvite: unsupportedAsync("Declining an invitation"),
    setPinned: unsupportedAsync("Pinning a chat"),
    setMarkedUnread: unsupportedAsync("Marking a chat unread"),
    markRead: unsupportedAsync("Marking a chat read"),
    setMuted: (roomId: string, muted: boolean) =>
      guard(async () => {
        await this.need().setMuted(roomId, muted);
        this.detailRefreshers.get(roomId)?.forEach((refresh) => refresh());
      }),
    createDirect: unsupportedAsync("Starting a chat"),
    createGroup: unsupportedAsync("Creating a group"),
    createSpace: unsupportedAsync("Creating a space"),
    joinRoom: unsupportedAsync("Joining a room"),
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

  readonly media = {
    resolve: unsupportedAsync("Pictures"),
    sharedPage: unsupportedAsync("Shared media"),
  };
  readonly messages = { forward: unsupportedAsync("Forwarding") };
  readonly spaces = {
    children: unsupportedAsync("Spaces"),
    subscribe: (..._args: unknown[]): Unsubscribe => noSubscription(),
    addChild: unsupportedAsync("Spaces"),
    removeChild: unsupportedAsync("Spaces"),
    moveChild: unsupportedAsync("Spaces"),
    candidates: unsupportedAsync("Spaces"),
  };
  /** Encryption setup is not wired yet: the app shows no banner and no recovery prompt for "unavailable". */
  readonly security = {
    state: async () => "unavailable" as const,
    onState: (cb: Listener<"unavailable">): Unsubscribe => {
      cb("unavailable");
      return noSubscription();
    },
    setUp: unsupportedAsync("Encryption setup"),
    restoreWithRecoveryKey: unsupportedAsync("Recovering encryption keys"),
  };
  readonly roomAdmin = {
    setName: (roomId: string, name: string) => guard(() => this.room(roomId).setName(name)),
    setTopic: (roomId: string, topic: string) => guard(() => this.room(roomId).setTopic(topic)),
    setAvatar: unsupportedAsync("Room pictures"),
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
    addAlias: unsupportedAsync("Room addresses"),
    removeAlias: unsupportedAsync("Room addresses"),
    setMainAlias: unsupportedAsync("Room addresses"),
  };
  readonly search = { messages: unsupportedAsync("Search") };
  readonly devices = { list: unsupportedAsync("Sessions"), remove: unsupportedAsync("Sessions") };
  readonly users = { search: unsupportedAsync("Finding people") };
  readonly notifications = { subscribe: (..._args: unknown[]): Unsubscribe => noSubscription() };

  // ---- everything else -------------------------------------------------------------------------------------------

  readonly profile = {
    subscribe: (cb: Listener<Profile | null>) => {
      this.profileListeners.add(cb);
      cb(this.lastProfile);
      return () => void this.profileListeners.delete(cb);
    },
    setDisplayName: async () => {
      throw unsupported("Changing the name");
    },
    setAvatar: async () => {
      throw unsupported("Changing the photo");
    },
    setStatus: async () => {
      throw unsupported("The status line");
    },
  };

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

  paginateBackwards = () => guard(async () => void (await (await this.timeline).paginateBackwards(30)));
  sendText = (body: string) => guard(async () => (await this.timeline).sendText(body));
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

  edit = async () => {
    throw unsupported("Editing");
  };
  redact = async () => {
    throw unsupported("Deleting");
  };
  sendAttachment = async () => {
    throw unsupported("Sending files");
  };
  cancelUpload = () => {};
  resend = async () => {
    throw unsupported("Sending again");
  };
  discard = () => {};
  reply = async () => {
    throw unsupported("Replying");
  };
  pin = async () => {
    throw unsupported("Pinning");
  };
  react = async () => {
    throw unsupported("Reactions");
  };

  close() {
    this.closed = true;
    this.listeners.clear();
    this.typingTask?.cancel();
    void this.task?.then((t) => t.cancel()).catch(() => {});
  }
}

export { toEngineError };
