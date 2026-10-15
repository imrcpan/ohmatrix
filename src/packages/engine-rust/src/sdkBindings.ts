/**
 * The real `Sdk`: matrix-rust-sdk through the generated bindings. This file is checked against the bindings' types, so
 * a change in the SDK's API shows here as a compile error. It is not run by the unit tests (it needs the native library);
 * what it hands over is read by `readEvent` / `toRoomSummary`, which are.
 */
import type * as Ffi from "./bindings.js";
import { readEvent, type RawEvent } from "./readEvent.js";
import { toEngineError } from "./errors.js";
import type { RoomInfoLike } from "./roomSummary.js";
import type {
  LatestEvent,
  ListChange,
  Sdk,
  SdkClient,
  SdkClientConfig,
  SdkRoom,
  SdkSession,
  SdkSyncService,
  SdkTask,
  SdkTimeline,
  TimelineEntry,
} from "./sdk.js";

type Bindings = typeof Ffi;

/** Our name for a numbered enum value of the bindings. */
const nameOf = <T extends Record<number, string>>(e: T, v: number): string => e[v] ?? String(v);

/** Make a binding call fail as an `EngineError`. */
async function call<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    throw toEngineError(e);
  }
}

const task = (h: { cancel(): void } | undefined): SdkTask => ({ cancel: () => h?.cancel() });

export function sdkFromBindings(b: Bindings): Sdk {
  const infoOf = (i: Ffi.RoomInfo): RoomInfoLike => ({
    id: i.id,
    displayName: i.displayName,
    rawName: i.rawName,
    avatarUrl: i.avatarUrl,
    isDirect: i.isDirect,
    isSpace: i.isSpace,
    isFavourite: i.isFavourite,
    membership: nameOf(b.Membership as unknown as Record<number, string>, i.membership) as RoomInfoLike["membership"],
    inviter: i.inviter ? { userId: i.inviter.userId, displayName: i.inviter.displayName } : undefined,
    joinedMembersCount: i.joinedMembersCount,
    numUnreadNotifications: i.numUnreadNotifications,
    numUnreadMentions: i.numUnreadMentions,
    isMarkedUnread: i.isMarkedUnread,
    mutedByUser: i.cachedUserDefinedNotificationMode === b.RoomNotificationMode.Mute,
  });

  const entryOf = (item: Ffi.TimelineItemLike): TimelineEntry => {
    const e = item.asEvent();
    return e ? { event: readEvent(e as unknown as RawEvent) } : {};
  };

  const timelineOf = (t: Ffi.TimelineLike): SdkTimeline => ({
    async onChanges(cb) {
      const handle = await t.addListener({
        onUpdate: (diffs) =>
          cb(
            diffs.map((d) => {
              const x = d as unknown as {
                tag: string;
                inner?: { values?: Ffi.TimelineItemLike[]; value?: Ffi.TimelineItemLike; index?: number; length?: number };
              };
              const inner = x.inner;
              return {
                tag: x.tag,
                inner: inner && {
                  ...(inner.values && { values: inner.values.map(entryOf) }),
                  ...(inner.value && { value: entryOf(inner.value) }),
                  ...(inner.index !== undefined && { index: inner.index }),
                  ...(inner.length !== undefined && { length: inner.length }),
                },
              } satisfies ListChange<TimelineEntry>;
            }),
          ),
      });
      return task(handle);
    },
    paginateBackwards: (count) => call(() => t.paginateBackwards(count)),
    async sendText(body) {
      const content = b.messageEventContentNew(new b.MessageType.Text({ content: { body } }));
      await call(() => t.send(content));
    },
    markRead: () => call(() => t.markAsRead(b.ReceiptType.Read)),
  });

  const roomOf = (r: Ffi.RoomLike): SdkRoom => ({
    id: () => r.id(),
    info: async () => infoOf(await call(() => r.roomInfo())),
    onInfo: (cb) => task(r.subscribeToRoomInfoUpdates({ call: (i) => cb(infoOf(i)) })),
    async latest(): Promise<LatestEvent> {
      const v = (await call(() => r.latestEvent())) as unknown as { tag: string; inner?: Record<string, unknown> };
      if (v.tag !== "Remote" && v.tag !== "Local") return {};
      // The newest event is given in a short form (no id); it is enough for the preview and the time of a row.
      const i = v.inner ?? {};
      return {
        item: readEvent({
          eventOrTransactionId: { tag: "EventId", inner: { eventId: "" } },
          sender: String(i["sender"] ?? ""),
          senderProfile: i["profile"] as RawEvent["senderProfile"],
          isOwn: Boolean(i["isOwn"]),
          content: i["content"] as RawEvent["content"],
          timestamp: i["timestamp"] as bigint,
        }),
      };
    },
    onTyping: (cb) => task(r.subscribeToTypingNotifications({ call: cb })),
    typingNotice: (typing) => call(() => r.typingNotice(typing)),
    timeline: async () => timelineOf(await call(() => r.timeline())),
  });

  const syncOf = (s: Ffi.SyncServiceLike): SdkSyncService => ({
    start: () => call(() => s.start()),
    stop: () => call(() => s.stop()),
    onState: (cb) => task(s.state({ onUpdate: (st) => cb(nameOf(b.SyncServiceState as unknown as Record<number, string>, st) as Parameters<typeof cb>[0]) })),
    async rooms(cb) {
      const list = await call(() => s.roomListService().allRooms());
      const result = list.entriesWithDynamicAdapters(100, {
        onUpdate: (updates) =>
          cb(
            updates.map((u) => {
              const x = u as unknown as { tag: string; inner?: { values?: Ffi.RoomLike[]; value?: Ffi.RoomLike; index?: number; length?: number } };
              const inner = x.inner;
              return {
                tag: x.tag,
                inner: inner && {
                  ...(inner.values && { values: inner.values.map(roomOf) }),
                  ...(inner.value && { value: roomOf(inner.value) }),
                  ...(inner.index !== undefined && { index: inner.index }),
                  ...(inner.length !== undefined && { length: inner.length }),
                },
              } satisfies ListChange<SdkRoom>;
            }),
          ),
      });
      // Joined and invited rooms, spaces included (the default shows none until a filter is set).
      result.controller().setFilter(new b.RoomListEntriesDynamicFilterKind.NonLeft());
      return { cancel: () => result.entriesStream().cancel(), loadMore: () => result.controller().addOnePage() };
    },
  });

  const clientOf = (c: Ffi.ClientLike): SdkClient => ({
    userId: () => c.userId(),
    session: () => c.session() as unknown as SdkSession,
    login: (user, password, deviceName) => call(() => c.login(user, password, deviceName, undefined)),
    restore: (s) => call(() => c.restoreSession(s as unknown as Ffi.Session)),
    logout: () => call(() => c.logout()),
    syncService: async () => syncOf(await call(async () => c.syncService().finish())),
    async profile() {
      const p = await call(() => c.getProfile(c.userId()));
      return { displayName: p.displayName, avatarUrl: p.avatarUrl };
    },
    room: (id) => {
      const r = c.getRoom(id);
      return r ? roomOf(r) : undefined;
    },
  });

  return {
    defaultSlidingSync: b.SlidingSyncVersion.Native,
    async newClient(config: SdkClientConfig) {
      const store = new b.SqliteStoreBuilder(config.dataDir, config.cacheDir).passphrase(config.passphrase);
      const client = await call(() =>
        new b.ClientBuilder()
          .homeserverUrl(config.homeserverUrl)
          .sqliteStore(store)
          .slidingSyncVersionBuilder(b.SlidingSyncVersionBuilder.DiscoverNative)
          .build(),
      );
      return clientOf(client);
    },
  };
}
