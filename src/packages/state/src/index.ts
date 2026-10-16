import { createStore, type StoreApi } from "zustand/vanilla";
import {
  applyUpdates,
  DEFAULT_PREFERENCES,
  type RoomDetails,
  EngineError,
  type EngineErrorCode,
  type Preferences,
  type EventId,
  type AttachmentSource,
  type DeviceInfo,
  type IncomingNotification,
  type SearchPage,
  type MatrixEngine,
  type RoomAdminApi,
  type MediaOptions,
  type Profile,
  type UserSuggestion,
  type MxcUri,
  type PlatformServices,
  type Session,
  type RoomId,
  type RoomSummary,
  type SpaceChild,
  type MediaKind,
  type SharedMediaPage,
  type SecurityState,
  type SyncState,
  type TimelineItem,
  type UserId,
} from "@ohmatrix/core";

export type SidebarPage = "chats" | "profile" | "settings" | "sessions";

export type AuthStatus = "booting" | "signedOut" | "signingIn" | "signedIn";

export interface AppState {
  auth: AuthStatus;
  authError: string | null;
  /** Why sign-in failed, so the screen can word it in the user's language. */
  authErrorCode: EngineErrorCode | null;
  userId: UserId | null;
  homeserver: string | null;
  syncState: SyncState;
  security: SecurityState;
  profile: Profile | null;
  rooms: RoomSummary[];
  timelines: Record<RoomId, TimelineItem[]>;
  /** Navigation state shared by all layouts; platform shells may mirror it to the URL/back stack. */
  selectedRoomId: RoomId | null;
  /** The space whose room list is open over the chat list; null = the main list. */
  spaceId: RoomId | null;
  /** The info panel of the open space (members, settings) is showing. It is independent of the selected chat. */
  spaceInfoOpen: boolean;
  prefs: Preferences;
  /** What the left pane shows: the chat list, my profile, or settings (settings sits above profile). */
  sidebarPage: SidebarPage;
  /** Chat-info panel of the selected room is open (slides in from the right). */
  roomInfoOpen: boolean;
  /** A message to scroll to once its chat is open (set by search results). */
  focusEvent: { roomId: RoomId; eventId: string } | null;
}

/** Handle for an open room; `close()` releases the engine timeline. */
export interface OpenRoom {
  /** Where the "New messages" divider goes; fixed at open time. */
  firstUnreadEventId: EventId | null;
  sendText(body: string, mentions?: UserId[]): Promise<void>;
  setTyping(typing: boolean): void;
  onTyping(cb: (names: string[]) => void): () => void;
  paginateBackwards(): Promise<void>;
  sendAttachment(file: AttachmentSource): Promise<void>;
  cancelUpload(id: string): void;
  resend(id: string): Promise<void>;
  discard(id: string): void;
  edit(eventId: EventId, body: string): Promise<void>;
  redact(eventId: EventId): Promise<void>;
  reply(eventId: EventId, body: string, mentions?: UserId[]): Promise<void>;
  react(eventId: EventId, key: string): Promise<void>;
  /** Pin or unpin a message in the room. */
  pin(eventId: EventId, pinned: boolean): Promise<void>;
  markRead(): Promise<void>;
  close(): void;
}

/**
 * Controller for ONE account/engine. Multi-account = one controller per account (no globals here).
 * Framework-agnostic: UIs subscribe to `store` (e.g. zustand's `useStore`).
 */
export interface AppController {
  store: StoreApi<AppState>;
  /** Restore a saved session, if any. Call once at startup. */
  bootstrap(): Promise<void>;
  login(homeserver: string, username: string, password: string): Promise<void>;
  /** Create an account on the server and sign in as it (see `AuthApi.register`). */
  register(homeserver: string, username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  /** Update and persist preferences (theme, language, sidebar width...). */
  setPreferences(patch: Partial<Preferences>): void;
  setDisplayName(name: string): Promise<void>;
  setStatus(status: string): Promise<void>;
  listDevices(): Promise<DeviceInfo[]>;
  /** Sign out other sessions (needs the password). */
  removeDevices(ids: string[], password: string): Promise<void>;
  setAvatar(file: AttachmentSource): Promise<void>;
  openSidebarPage(page: SidebarPage): void;
  /** Open a space's room list (slides over the chat list); null closes it. */
  openSpace(spaceId: RoomId | null): void;
  /** Show or hide the open space's info panel, without selecting the space as a chat. */
  openSpaceInfo(open: boolean): void;
  /** One level up: settings → profile → chats. */
  sidebarBack(): void;
  /**
   * Step back one layer, the topmost first: a space's info page, a chat's info panel, the open chat, a profile or
   * settings page, a space. Returns false when there is nothing left to step back from, which is when the platform's
   * own back (leaving the app) should happen.
   */
  back(): boolean;
  openRoomInfo(open: boolean): void;
  selectRoom(roomId: RoomId | null): void;
  acceptInvite(roomId: RoomId): Promise<void>;
  declineInvite(roomId: RoomId): Promise<void>;
  setPinned(roomId: RoomId, pinned: boolean): Promise<void>;
  setMarkedUnread(roomId: RoomId, unread: boolean): Promise<void>;
  markRoomRead(roomId: RoomId): Promise<void>;
  /** Search messages (see `SearchApi`). */
  searchMessages(opts: { term: string; roomId?: RoomId; from?: string }): Promise<SearchPage>;
  /** Open a chat and scroll to one of its messages (loading older history if needed). */
  openMessage(roomId: RoomId, eventId: string): void;
  clearFocusEvent(): void;
  /** Room administration (name, topic, avatar, invitations, removal, roles). */
  roomAdmin: RoomAdminApi;
  /** Load older messages of an open room (e.g. to find more shared media). */
  paginateRoom(roomId: RoomId): Promise<void>;
  /** Fires for each new message that should notify (see `NotificationsApi`). */
  subscribeNotifications(cb: (n: IncomingNotification) => void): () => void;
  /** Mute or unmute a room. */
  setRoomMuted(roomId: RoomId, muted: boolean): Promise<void>;
  /** Search the user directory (also resolves a full user id). */
  searchUsers(term: string): Promise<UserSuggestion[]>;
  /** Subscribe to the chat-info data of a room. */
  subscribeRoomDetails(roomId: RoomId, cb: (d: RoomDetails) => void): () => void;
  /** Leave (or delete, for one-to-one chats) a room and deselect it. */
  leaveRoom(roomId: RoomId): Promise<void>;
  /** Start (or reopen) a chat with a user, then select it. */
  startDirectChat(userId: string): Promise<void>;
  /** `inSpace`: also list the new room in that space (and do not leave the space's list). */
  createGroup(name: string, invite: string[], inSpace?: RoomId | null): Promise<void>;
  /** Create a space and open its room list. */
  createSpace(name: string, invite?: string[]): Promise<void>;
  /** Rooms listed in a space, in the space's own order. Emits once and on every change. */
  subscribeSpace(spaceId: RoomId, cb: (children: SpaceChild[]) => void): () => void;
  /** Rooms I could add to this space. */
  spaceCandidates(spaceId: RoomId): Promise<SpaceChild[]>;
  addSpaceChild(spaceId: RoomId, roomId: RoomId): Promise<void>;
  removeSpaceChild(spaceId: RoomId, roomId: RoomId): Promise<void>;
  moveSpaceChild(spaceId: RoomId, roomId: RoomId, to: "first" | "last"): Promise<void>;
  /** Join a room by id or alias, then select it. */
  joinRoom(idOrAlias: string): Promise<void>;
  /** Create encryption keys; resolves with the recovery key to show the user exactly once. */
  setUpEncryption(password: string): Promise<string>;
  restoreWithRecoveryKey(recoveryKey: string): Promise<void>;
  openRoom(roomId: RoomId): OpenRoom;
  /** A page of the room's shared media of one kind, newest first (see MediaApi.sharedPage). */
  sharedMedia(roomId: RoomId, opts: { kind: MediaKind; from?: string; want?: number }): Promise<SharedMediaPage>;
  /** Forward a message into another room, copying text, mentions and attachments. */
  forwardMessage(fromRoomId: RoomId, eventId: EventId, toRoomId: RoomId): Promise<void>;
  /** Resolve an mxc:// URI to a loadable image URL (cached by the engine). */
  resolveMedia(mxc: MxcUri, opts?: MediaOptions): Promise<string>;
  dispose(): void;
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function createAppController(engine: MatrixEngine, services: PlatformServices): AppController {
  const store = createStore<AppState>(() => ({
    auth: "booting",
    authError: null,
    authErrorCode: null,
    userId: null,
    homeserver: null,
    syncState: "stopped",
    security: "unavailable",
    profile: null,
    rooms: [],
    timelines: {},
    selectedRoomId: null,
    prefs: DEFAULT_PREFERENCES,
    sidebarPage: "chats",
    roomInfoOpen: false,
    focusEvent: null,
    spaceId: null,
    spaceInfoOpen: false,
  }));
  const set = store.setState;
  const offs = [
    engine.sync.onState((syncState) => set({ syncState })),
    engine.security.onState((security) => set({ security })),
    engine.profile.subscribe((profile) => set({ profile })),
    engine.rooms.subscribe((updates) => set((s) => ({ rooms: applyUpdates(s.rooms, updates) }))),
  ];

  // Opening a chat closes the space's info panel: the one panel on the right belongs to what is on screen.
  const select = (selectedRoomId: RoomId | null) =>
    set((s) => (s.selectedRoomId === selectedRoomId ? { spaceInfoOpen: false } : { selectedRoomId, roomInfoOpen: false, spaceInfoOpen: false }));

  const handles = new Map<RoomId, ReturnType<MatrixEngine["openTimeline"]>>(); // the timeline each open room uses

  const signedOut = (authError: string | null = null, authErrorCode: EngineErrorCode | null = null) =>
    set({
      auth: "signedOut",
      authError,
      authErrorCode,
      userId: null,
      homeserver: null,
      rooms: [],
      timelines: {},
      selectedRoomId: null,
      sidebarPage: "chats",
      roomInfoOpen: false,
    });

  /** Signing in and registering end the same way: keep the session, remember the server, start syncing. */
  const signIn = async (homeserver: string, start: () => Promise<Session>) => {
    set({ auth: "signingIn", authError: null, authErrorCode: null });
    try {
      const session = await start();
      await services.sessionStore.save(session);
      set({ auth: "signedIn", userId: session.userId, homeserver: session.homeserver });
      // Offered again the next time the sign-in screen is shown (after signing out, or on another account).
      const typed = homeserver.trim();
      if (store.getState().prefs.lastHomeserver !== typed) {
        set((s) => ({ prefs: { ...s.prefs, lastHomeserver: typed } }));
        void services.preferences?.save(store.getState().prefs).catch(() => {});
      }
      await engine.sync.start();
    } catch (e) {
      signedOut(messageOf(e), e instanceof EngineError ? e.code : null);
    }
  };

  return {
    store,
    async bootstrap() {
      try {
        const saved = await services.preferences?.load().catch(() => ({}));
        set((s) => ({ prefs: { ...s.prefs, ...saved } }));
        const session = await services.sessionStore.load();
        if (!session) return signedOut();
        await engine.auth.restore(session);
        set({ auth: "signedIn", userId: session.userId, homeserver: session.homeserver });
        // The saved session is trusted until the server says otherwise: with no network the chats show from the cache,
        // and the sync state says offline. Only an answer from the server (a dead token) sends the user to sign in.
        await engine.sync.start().catch((e) => {
          if (e instanceof EngineError && (e.code === "unauthorized" || e.code === "keys_lost")) throw e;
        });
      } catch (e) {
        const forced = e instanceof EngineError && (e.code === "unauthorized" || e.code === "keys_lost");
        if (forced) await services.sessionStore.clear();
        signedOut(e instanceof EngineError && e.code === "unauthorized" ? null : messageOf(e));
      }
    },
    login: (homeserver, username, password) => signIn(homeserver, () => engine.auth.loginWithPassword(homeserver, username, password)),
    register: (homeserver, username, password) => signIn(homeserver, () => engine.auth.register(homeserver, username, password)),
    async logout() {
      try {
        await engine.auth.logout();
      } finally {
        await services.sessionStore.clear();
        signedOut();
      }
    },
    setPreferences(patch) {
      set((s) => ({ prefs: { ...s.prefs, ...patch } }));
      void services.preferences?.save(store.getState().prefs).catch(() => {});
    },
    setDisplayName: (name) => engine.profile.setDisplayName(name.trim()),
    setStatus: (status) => engine.profile.setStatus(status),
    listDevices: () => engine.devices.list(),
    removeDevices: (ids, password) => engine.devices.remove(ids, password),
    setAvatar: (file) => engine.profile.setAvatar(file),
    openSidebarPage: (sidebarPage) => set({ sidebarPage }),
    openSpace: (spaceId) => set({ spaceId, spaceInfoOpen: false }),
    openSpaceInfo: (open) => set((s) => ({ spaceInfoOpen: open && s.spaceId !== null, ...(open ? { roomInfoOpen: false } : {}) })),
    back() {
      const s = store.getState();
      if (s.spaceInfoOpen) set({ spaceInfoOpen: false });
      else if (s.roomInfoOpen) set({ roomInfoOpen: false });
      else if (s.selectedRoomId !== null) select(null);
      else if (s.sidebarPage !== "chats") set({ sidebarPage: s.sidebarPage === "sessions" ? "settings" : s.sidebarPage === "settings" ? "profile" : "chats" });
      else if (s.spaceId !== null) set({ spaceId: null, spaceInfoOpen: false });
      else return false;
      return true;
    },
    sidebarBack: () => set((s) => ({ sidebarPage: s.sidebarPage === "sessions" ? "settings" : s.sidebarPage === "settings" ? "profile" : "chats" })),
    openRoomInfo: (roomInfoOpen) =>
      set((s) => ({ roomInfoOpen: roomInfoOpen && s.selectedRoomId !== null, ...(roomInfoOpen ? { spaceInfoOpen: false } : {}) })),
    selectRoom: select,
    async acceptInvite(roomId) {
      await engine.rooms.acceptInvite(roomId);
      select(roomId);
    },
    setPinned: (roomId, pinned) => engine.rooms.setPinned(roomId, pinned),
    setMarkedUnread: (roomId, unread) => engine.rooms.setMarkedUnread(roomId, unread),
    markRoomRead: (roomId) => engine.rooms.markRead(roomId),
    searchMessages: (opts) => engine.search.messages(opts),
    openMessage(roomId, eventId) {
      select(roomId);
      set({ focusEvent: { roomId, eventId } });
    },
    clearFocusEvent: () => set({ focusEvent: null }),
    roomAdmin: engine.roomAdmin,
    paginateRoom: async (roomId) => {
      await handles.get(roomId)?.paginateBackwards();
    },
    subscribeNotifications: (cb) => engine.notifications.subscribe(cb),
    setRoomMuted: (roomId, muted) => engine.rooms.setMuted(roomId, muted),
    searchUsers: (term) => engine.users.search(term),
    subscribeRoomDetails: (roomId, cb) => engine.rooms.subscribeDetails(roomId, cb),
    async leaveRoom(roomId) {
      await engine.rooms.leave(roomId);
      set((s) => ({
        ...(s.selectedRoomId === roomId ? { selectedRoomId: null, roomInfoOpen: false } : {}),
        // Leaving the space that is open closes it (and its info panel) rather than leaving a pane for a room that is gone.
        ...(s.spaceId === roomId ? { spaceId: null, spaceInfoOpen: false } : {}),
      }));
    },
    declineInvite: (roomId) => engine.rooms.declineInvite(roomId),
    async startDirectChat(userId) {
      select(await engine.rooms.createDirect(userId.trim()));
    },
    async createGroup(name, invite, inSpace) {
      const id = await engine.rooms.createGroup({ name: name.trim(), invite });
      // Created from inside a space: list it there too, and stay on the space's list instead of jumping to the chat.
      if (inSpace) await engine.spaces.addChild(inSpace, id);
      else select(id);
    },
    async createSpace(name, invite) {
      const id = await engine.rooms.createSpace({ name: name.trim(), ...(invite?.length ? { invite } : {}) });
      set({ spaceId: id });
    },
    subscribeSpace: (spaceId, cb) => engine.spaces.subscribe(spaceId, cb),
    spaceCandidates: (spaceId) => engine.spaces.candidates(spaceId),
    addSpaceChild: (spaceId, roomId) => engine.spaces.addChild(spaceId, roomId),
    removeSpaceChild: (spaceId, roomId) => engine.spaces.removeChild(spaceId, roomId),
    moveSpaceChild: (spaceId, roomId, to) => engine.spaces.moveChild(spaceId, roomId, to),
    async joinRoom(idOrAlias) {
      select(await engine.rooms.joinRoom(idOrAlias));
    },
    setUpEncryption: async (password) => (await engine.security.setUp({ password })).recoveryKey,
    restoreWithRecoveryKey: (key) => engine.security.restoreWithRecoveryKey(key),
    forwardMessage: (fromRoomId, eventId, toRoomId) => engine.messages.forward({ fromRoomId, eventId, toRoomId }),
    resolveMedia: (mxc, opts) => engine.media.resolve(mxc, opts),
    sharedMedia: (roomId, opts) => engine.media.sharedPage(roomId, opts),
    openRoom(roomId) {
      const tl = engine.openTimeline(roomId);
      handles.set(roomId, tl);
      const off = tl.subscribe((updates) => set((s) => ({ timelines: { ...s.timelines, [roomId]: applyUpdates(s.timelines[roomId] ?? [], updates) } })));
      void tl.markRead().catch(() => {});
      return {
        firstUnreadEventId: tl.firstUnreadEventId,
        sendText: (body, mentions) => tl.sendText(body, mentions),
        setTyping: (typing) => tl.setTyping(typing),
        onTyping: (cb) => tl.onTyping(cb),
        paginateBackwards: () => tl.paginateBackwards(),
        sendAttachment: (file) => tl.sendAttachment(file),
        cancelUpload: (id) => tl.cancelUpload(id),
        resend: (id) => tl.resend(id),
        discard: (id) => tl.discard(id),
        edit: (eventId, body) => tl.edit(eventId, body),
        redact: (eventId) => tl.redact(eventId),
        reply: (eventId, body, mentions) => tl.reply(eventId, body, mentions),
        react: (eventId, key) => tl.react(eventId, key),
        pin: (eventId, pinned) => tl.pin(eventId, pinned),
        markRead: () => tl.markRead(),
        close: () => {
          off();
          tl.close();
          if (handles.get(roomId) === tl) handles.delete(roomId);
        },
      };
    },
    dispose: () => offs.forEach((off) => off()),
  };
}

/** Unread badge total across chats: counts of notifying chats, a manual "unread" mark counts as one; muted chats and invites are skipped. */
export function totalUnread(rooms: readonly RoomSummary[]): number {
  let n = 0;
  for (const r of rooms) {
    if (r.invite || r.muted) continue;
    n += r.unreadCount > 0 ? r.unreadCount : r.markedUnread ? 1 : 0;
  }
  return n;
}
