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
  RawLevels,
  RawMember,
  RawRoomDetails,
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

/** A power level as a number; an unbounded one (a room's creator) reads as 100. */
const powerOf = (p: Ffi.PowerLevel): number => (p.tag === "Value" ? Number((p as { inner: { value: bigint } }).inner.value) : 100);

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
    details: () => detailsOf(r),
    leave: () => call(() => r.leave()),
    setName: (name) => call(() => r.setName(name)),
    setTopic: (topic) => call(() => r.setTopic(topic)),
    invite: (userId) => call(() => r.inviteUserById(userId)),
    kick: (userId) => call(() => r.kickUser(userId, undefined)),
    ban: (userId, reason) => call(() => r.banUser(userId, reason)),
    unban: (userId) => call(() => r.unbanUser(userId, undefined)),
    setPower: (userId, level) => call(() => r.updatePowerLevelsForUsers([{ userId, powerLevel: BigInt(level) }])),
    setLevels: (patch) => {
      const big = (n: number | undefined) => (n === undefined ? undefined : BigInt(n));
      return call(() =>
        r.applyPowerLevelChanges({
          ban: big(patch.ban),
          invite: big(patch.invite),
          kick: big(patch.kick),
          redact: big(patch.redact),
          eventsDefault: big(patch.eventsDefault),
          stateDefault: big(patch.stateDefault),
        } as Ffi.RoomPowerLevelChanges),
      );
    },
    setJoinRule: (rule) => call(() => r.updateJoinRules(rule === "public" ? new b.JoinRule.Public() : new b.JoinRule.Invite())),
    setHistoryVisibility: (v) =>
      call(() =>
        r.updateHistoryVisibility(
          v === "invited"
            ? new b.RoomHistoryVisibility.Invited()
            : v === "joined"
              ? new b.RoomHistoryVisibility.Joined()
              : v === "world_readable"
                ? new b.RoomHistoryVisibility.WorldReadable()
                : new b.RoomHistoryVisibility.Shared(),
        ),
      ),
  });

  const membershipOf = (m: Ffi.MembershipState): RawMember["membership"] => {
    const tag = (m as { tag: string }).tag;
    return tag === "Join" || tag === "Invite" || tag === "Ban" ? tag : "Other";
  };

  const detailsOf = async (r: Ffi.RoomLike): Promise<RawRoomDetails> => {
    const info = await call(() => r.roomInfo());
    const levels = await call(() => r.getPowerLevels());
    // The people: the SDK hands them over in chunks.
    const iter = await call(() => r.members());
    const members: RawMember[] = [];
    for (let chunk = iter.nextChunk(200); chunk && chunk.length; chunk = iter.nextChunk(200)) {
      for (const m of chunk) {
        members.push({
          userId: m.userId,
          displayName: m.displayName,
          avatarUrl: m.avatarUrl,
          membership: membershipOf(m.membership),
          power: powerOf(m.powerLevel),
          reason: m.membershipChangeReason,
        });
      }
    }
    const v = levels.values();
    const num = (n: bigint) => Number(n);
    const raw: RawLevels = {
      invite: num(v.invite),
      kick: num(v.kick),
      ban: num(v.ban),
      redact: num(v.redact),
      eventsDefault: num(v.eventsDefault),
      stateDefault: num(v.stateDefault),
    };
    const state = (t: keyof typeof b.StateEventType) => levels.canOwnUserSendState(new (b.StateEventType[t] as new () => Ffi.StateEventType)());
    return {
      id: info.id,
      name: info.displayName || info.rawName || info.id,
      topic: info.topic,
      avatarUrl: info.avatarUrl,
      canonicalAlias: info.canonicalAlias,
      alternativeAliases: info.alternativeAliases,
      joinRule: info.joinRule ? (info.joinRule as { tag: string }).tag : undefined,
      historyVisibility: (info.historyVisibility as { tag: string }).tag,
      isDirect: info.isDirect,
      isEncrypted: info.encryptionState === b.EncryptionState.Encrypted,
      muted: info.cachedUserDefinedNotificationMode === b.RoomNotificationMode.Mute,
      pinnedEventIds: info.pinnedEventIds,
      me: r.ownUserId(),
      members,
      levels: raw,
      can: {
        invite: levels.canOwnUserInvite(),
        kick: levels.canOwnUserKick(),
        ban: levels.canOwnUserBan(),
        pin: levels.canOwnUserPinUnpin(),
        editName: state("RoomName"),
        editTopic: state("RoomTopic"),
        joinRules: state("RoomJoinRules"),
        history: state("RoomHistoryVisibility"),
        levels: state("RoomPowerLevels"),
      },
    };
  };

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
    async setMuted(roomId, muted) {
      const settings = await call(() => c.getNotificationSettings());
      await call(() => (muted ? settings.setRoomNotificationMode(roomId, b.RoomNotificationMode.Mute) : settings.restoreDefaultRoomNotificationMode(roomId)));
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
