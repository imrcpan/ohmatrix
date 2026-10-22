/**
 * The real `Sdk`: matrix-rust-sdk through the generated bindings. This file is checked against the bindings' types, so
 * a change in the SDK's API shows here as a compile error. It is not run by the unit tests (it needs the native library);
 * what it hands over is read by `readEvent` / `toRoomSummary`, which are.
 */
import type * as Ffi from "./bindings.js";
import { messageBody, readEvent, type RawEvent } from "./readEvent.js";
import { toBase64 } from "./base64.js";
import { toEngineError } from "./errors.js";
import type { RoomInfoLike } from "./roomSummary.js";
import type { RawSecurity } from "./security.js";
import type { SdkVerification, VerifyEvent } from "./verification.js";
import type {
  LatestEvent,
  ListChange,
  Sdk,
  SdkClient,
  EventRef,
  SdkClientConfig,
  RawHit,
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
  /** Downloaded files that must stay on disk while the app runs. */
  const files: Ffi.MediaFileHandleLike[] = [];
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

  /** Whether a text has anything in it that markdown would make something of. */
  const hasMarkdown = (body: string) => /[*_`~#>[\]\\|]|^\s*(\d+[.)]|[-+])\s/m.test(body);

  /**
   * A message as the markdown it was typed as, with the people it mentions. A plain text is sent plain: an edit of a
   * message with no formatting would otherwise carry an empty formatted fallback.
   */
  const contentOf = (body: string, mentions?: string[]) => {
    const content = hasMarkdown(body) ? b.messageEventContentFromMarkdown(body) : b.messageEventContentNew(new b.MessageType.Text({ content: { body } }));
    return mentions?.length ? content.withMentions({ userIds: mentions, room: false }) : content;
  };
  const idOf = (ref: EventRef): Ffi.EventOrTransactionId =>
    ref.eventId !== undefined
      ? new b.EventOrTransactionId.EventId({ eventId: ref.eventId })
      : new b.EventOrTransactionId.TransactionId({ transactionId: ref.transactionId });

  const timelineOf = (t: Ffi.TimelineLike): SdkTimeline => {
    // What a reply quotes is not fetched with the reply: the SDK reports it as unavailable until it is asked to load
    // it, and then sends the reply again with the quote filled in. So each reply with no quote yet is asked about once.
    const asked = new Set<string>();
    const read = (item: Ffi.TimelineItemLike): TimelineEntry => {
      const entry = entryOf(item);
      const ev = entry.event;
      const reply = (ev?.content as { replyTo?: { original?: unknown } } | undefined)?.replyTo;
      if (ev?.eventId && reply && !reply.original && !asked.has(ev.eventId)) {
        asked.add(ev.eventId);
        void t.fetchDetailsForEvent(ev.eventId).catch(() => {});
      }
      return entry;
    };
    return {
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
                    ...(inner.values && { values: inner.values.map(read) }),
                    ...(inner.value && { value: read(inner.value) }),
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
      async sendText(body, mentions) {
        await call(() => t.send(contentOf(body, mentions)));
      },
      reply: (eventId, body, mentions) => call(() => t.sendReply(contentOf(body, mentions), eventId)),
      edit: (ref, body) => call(() => t.edit(idOf(ref), new b.EditedContent.RoomMessage({ content: contentOf(body) }))),
      redact: (ref) => call(() => t.redactEvent(idOf(ref), undefined)),
      react: async (ref, key) => void (await call(() => t.toggleReaction(idOf(ref), key))),
      pin: async (eventId, pinned) => void (await call(() => (pinned ? t.pinEvent(eventId) : t.unpinEvent(eventId)))),
      markRead: () => call(() => t.markAsRead(b.ReceiptType.Read)),
      item: async (eventId) => readEvent((await call(() => t.getEventTimelineItemByEventId(eventId))) as unknown as RawEvent),
      async sendMedia(f) {
        const params: Ffi.UploadParameters = { source: new b.UploadSource.File({ filename: f.path }) };
        const dims = {
          ...(f.width !== undefined && { width: BigInt(Math.round(f.width)) }),
          ...(f.height !== undefined && { height: BigInt(Math.round(f.height)) }),
        };
        // The SDK insists on a blurhash for a picture and a video; one the sender could not compute is a flat grey.
        const blurhash = f.blurhash ?? "L00000fQfQfQfQfQfQfQfQfQfQfQ";
        const common = { mimetype: f.mimeType, size: BigInt(Math.round(f.size)) };
        const duration = f.durationMs !== undefined ? { duration: f.durationMs } : {};
        const handle =
          f.kind === "image"
            ? t.sendImage(params, undefined, { ...common, ...dims, blurhash })
            : f.kind === "video"
              ? t.sendVideo(params, undefined, { ...common, ...dims, ...duration, blurhash })
              : f.kind === "audio"
                ? f.voice
                  ? // The SDK takes levels from 0 to 1 and writes the event's whole numbers (up to 1024) itself.
                    t.sendVoiceMessage(params, { ...common, ...duration }, f.waveform ?? [])
                  : t.sendAudio(params, { ...common, ...duration })
                : t.sendFile(params, common);
        await call(() => handle.join());
      },
    };
  };

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
    details: (opts) => detailsOf(r, opts?.people !== false),
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
    join: () => call(() => r.join()),
    markRead: async () => {
      await call(() => r.markAsRead(b.ReceiptType.Read));
      await call(() => r.setUnreadFlag(false));
    },
    setFavourite: (favourite) => call(() => r.setIsFavourite(favourite, undefined)),
    setUnreadFlag: (unread) => call(() => r.setUnreadFlag(unread)),
    retrySending: async () => r.enableSendQueue(true),
    setAvatar: (mimeType, data) => call(() => r.uploadAvatar(mimeType, data, undefined)),
    sendRaw: (eventType, content) => call(() => r.sendRaw(eventType, content)),
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

  const detailsOf = async (r: Ffi.RoomLike, people = true): Promise<RawRoomDetails> => {
    const info = await call(() => r.roomInfo());
    const levels = await call(() => r.getPowerLevels());
    // The people: the SDK hands them over in chunks.
    const members: RawMember[] = [];
    const iter = people ? await call(() => r.members()) : null;
    for (let chunk = iter?.nextChunk(200); chunk && chunk.length; chunk = iter?.nextChunk(200)) {
      // Each chunk is a lot of calls across to the SDK, on the thread that draws the screen: let it draw between them.
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 0));
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
    setPusher: (p) =>
      call(() =>
        c.setPusher(
          { pushkey: p.pushKey, appId: p.appId },
          // The gateway copies the default payload into the push: it is how the app, with nothing running, knows which account a push is for.
          new b.PusherKind.Http({ data: { url: p.gatewayUrl, format: b.PushFormat.EventIdOnly, defaultPayload: JSON.stringify({ user_id: c.userId() }) } }),
          p.appName,
          p.deviceName,
          undefined,
          p.lang,
          false,
        ),
      ),
    deletePusher: (p) => call(() => c.deletePusher({ pushkey: p.pushKey, appId: p.appId })),
    createRoom: (o) =>
      call(() =>
        c.createRoom({
          ...(o.name && { name: o.name }),
          ...(o.topic !== undefined && { topic: o.topic }),
          isEncrypted: o.encrypted,
          isDirect: o.direct,
          visibility: new b.RoomVisibility.Private(),
          preset: o.direct ? b.RoomPreset.TrustedPrivateChat : b.RoomPreset.PrivateChat,
          invite: o.invite,
          isSpace: o.space,
        }),
      ),
    joinRoom: async (idOrAlias) => (await call(() => c.joinRoomByIdOrAlias(idOrAlias, []))).id(),
    directRoom: (userId) => c.getDmRoom(userId)?.id(),
    ignoreUser: (userId) => call(() => c.ignoreUser(userId)),
    searchUsers: async (term, limit) => (await call(() => c.searchUsers(term, BigInt(limit)))).results,
    userProfile: (userId) => call(() => c.getProfile(userId)),
    setDisplayName: (name) => call(() => c.setDisplayName(name)),
    setAvatar: (mimeType, data) => call(() => c.uploadAvatar(mimeType, data)),
    security() {
      const enc = c.encryption();
      const recoveryName = ["Unknown", "Enabled", "Disabled", "Incomplete"] as const;
      return {
        async read(): Promise<RawSecurity> {
          const v = enc.verificationState();
          return {
            recovery: recoveryName[enc.recoveryState()] ?? "Unknown",
            verified: v === b.VerificationState.Verified ? true : v === b.VerificationState.Unverified ? false : undefined,
            backupOnServer: await enc.backupExistsOnServer().catch(() => false),
          };
        },
        onChange(cb) {
          const handles = [
            enc.recoveryStateListener({ onUpdate: cb }),
            enc.verificationStateListener({ onUpdate: cb }),
            enc.backupStateListener({ onUpdate: cb }),
          ];
          return { cancel: () => handles.forEach((h) => h.cancel()) };
        },
        async setUp(password) {
          // The account's own keys first (a new identity: the server wants the password for it), then the recovery that keeps them.
          const handle = await call(() => enc.resetIdentity());
          if (handle) await call(() => handle.reset(new b.AuthData.Password({ passwordDetails: { identifier: c.userId(), password } })));
          return await call(() => enc.enableRecovery(false, undefined, { onUpdate: () => {} }));
        },
        recover: (recoveryKey) => call(() => enc.recover(recoveryKey)),
      };
    },
    async verification(): Promise<SdkVerification> {
      const ctl = await call(() => c.getSessionVerificationController());
      let emit: (e: VerifyEvent) => void = () => {};
      ctl.setDelegate({
        didReceiveVerificationRequest: (d) => emit({ kind: "request", userId: d.senderProfile.userId, flowId: d.flowId, deviceName: d.deviceDisplayName }),
        didAcceptVerificationRequest: () => emit({ kind: "accepted" }),
        didStartSasVerification: () => emit({ kind: "started" }),
        didReceiveVerificationData: (data) => {
          if (data.tag === b.SessionVerificationData_Tags.Emojis)
            emit({ kind: "emojis", emojis: data.inner.emojis.map((e) => ({ symbol: e.symbol(), name: e.description() })) });
          // The numbers form is not offered: both sides take the pictures.
          else void call(() => ctl.cancelVerification()).catch(() => {});
        },
        didFail: () => emit({ kind: "failed" }),
        didCancel: () => emit({ kind: "cancelled" }),
        didFinish: () => emit({ kind: "finished" }),
      });
      return {
        listen: (cb) => void (emit = cb),
        requestSession: () => call(() => ctl.requestDeviceVerification()),
        requestUser: (userId) => call(() => ctl.requestUserVerification(userId)),
        accept: async (userId, flowId) => {
          await call(() => ctl.acknowledgeVerificationRequest(userId, flowId));
          await call(() => ctl.acceptVerificationRequest());
        },
        startEmojis: () => call(() => ctl.startSasVerification()),
        approve: () => call(() => ctl.approveVerification()),
        decline: () => call(() => ctl.declineVerification()),
        cancel: () => call(() => ctl.cancelVerification()),
      };
    },
    search(term, roomId) {
      type Hit = { eventId: string; sender: string; senderProfile: Ffi.ProfileDetails; content: Ffi.TimelineItemContent; timestamp: bigint };
      const hit = (roomId: string, r: Hit): RawHit => {
        const profile = r.senderProfile as unknown as { tag: string; inner?: { displayName?: string } };
        const content = r.content as unknown as {
          tag: string;
          inner?: { content?: { kind?: { tag: string; inner?: { content?: { msgType?: { tag: string; inner?: { content?: Record<string, unknown> } } } } } } };
        };
        const msgType = content.inner?.content?.kind?.inner?.content?.msgType;
        return {
          roomId,
          eventId: r.eventId,
          sender: r.sender,
          ...(profile.tag === "Ready" && profile.inner?.displayName && { senderName: profile.inner.displayName }),
          ts: Number(r.timestamp),
          text: (msgType && messageBody(msgType)?.body) || "",
        };
      };
      const room = roomId ? c.getRoom(roomId) : undefined;
      if (roomId && room) {
        const it = room.searchMessages(term, 20);
        return { next: async () => (await call(() => it.nextEvents()))?.map((r) => hit(roomId, r)) };
      }
      let it: Promise<Ffi.GlobalSearchIteratorLike> | undefined;
      return {
        async next() {
          it ??= call(() => c.searchMessages(term, b.SearchRoomFilter.Rooms, 20));
          return (await call(async () => (await it)!.nextEvents()))?.map((r) => hit(r.roomId, r.result));
        },
      };
    },
    async mediaUrl(mxc, o) {
      const source = o.source ? b.MediaSource.fromJson(o.source) : b.MediaSource.fromUrl(mxc);
      // A thumbnail comes as bytes and goes into the page as a data address; a whole file is kept on disk by the SDK.
      if (o.width && o.height && !o.source) {
        const bytes = await call(() => c.getMediaThumbnail(source, BigInt(o.width ?? 0), BigInt(o.height ?? 0)));
        return `data:${o.mimeType ?? "image/jpeg"};base64,${toBase64(bytes)}`;
      }
      const handle = await call(() => c.getMediaFile(source, undefined, o.mimeType ?? "application/octet-stream", true, undefined)).finally(() =>
        (source as { uniffiDestroy?: () => void }).uniffiDestroy?.(),
      );
      // The file goes away with its handle, so the handles are kept for as long as the client lives.
      files.push(handle);
      return `file://${handle.path()}`;
    },
    releaseMedia() {
      // Dropping a handle deletes its file; the pictures on screen are gone with the session.
      for (const h of files.splice(0)) (h as { uniffiDestroy?: () => void }).uniffiDestroy?.();
    },
    room: (id) => {
      const r = c.getRoom(id);
      return r ? roomOf(r) : undefined;
    },
  });

  return {
    defaultSlidingSync: b.SlidingSyncVersion.Native,
    async newClient(config: SdkClientConfig) {
      const store = new b.SqliteStoreBuilder(config.dataDir, config.cacheDir).key(config.key);
      const client = await call(() =>
        new b.ClientBuilder()
          .homeserverUrl(config.homeserverUrl)
          .sqliteStore(store)
          // Discovery asks the server, which an app opened without a network cannot; the session carries what was found.
          .slidingSyncVersionBuilder(config.restoring ? b.SlidingSyncVersionBuilder.Native : b.SlidingSyncVersionBuilder.DiscoverNative)
          .build(),
      );
      return clientOf(client);
    },
  };
}
