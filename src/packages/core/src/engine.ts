import type { ListUpdate } from "./diff.js";
import type {
  AttachmentSource,
  HistoryVisibility,
  PowerThresholds,
  DeviceInfo,
  SearchPage,
  MemberRole,
  IncomingNotification,
  RoomDetails,
  SpaceChild,
  MediaKind,
  SharedMediaPage,
  Profile,
  UserSuggestion,
  EventId,
  MxcUri,
  RoomId,
  UserId,
  RoomSummary,
  SecurityState,
  Session,
  SyncState,
  TimelineItem,
} from "./types.js";

export type Unsubscribe = () => void;
export type Listener<T> = (value: T) => void;

export interface AuthApi {
  loginWithPassword(homeserver: string, username: string, password: string): Promise<Session>;
  /**
   * Create an account with a username and password and sign in as it. Only servers that need nothing more than that
   * can be registered on (no e-mail address, captcha or terms to accept); on any other it throws `unsupported`, and on a
   * server that has registration closed it throws `forbidden`. A taken username is a `conflict`.
   */
  register(homeserver: string, username: string, password: string): Promise<Session>;
  restore(session: Session): Promise<void>;
  logout(): Promise<void>;
}

export interface SyncApi {
  start(): Promise<void>;
  stop(): Promise<void>;
  onState(cb: Listener<SyncState>): Unsubscribe;
}

export interface RoomListApi {
  /** Immediately emits a `reset` with the current list, then incremental updates. */
  subscribe(cb: Listener<ListUpdate<RoomSummary>[]>): Unsubscribe;
  /** Join a room I was invited to. */
  acceptInvite(roomId: RoomId): Promise<void>;
  /** Reject an invitation. */
  declineInvite(roomId: RoomId): Promise<void>;
  setPinned(roomId: RoomId, pinned: boolean): Promise<void>;
  setMarkedUnread(roomId: RoomId, unread: boolean): Promise<void>;
  /** Mark everything read (receipt) and clear a manual unread mark, without opening the chat. */
  markRead(roomId: RoomId): Promise<void>;
  /** Live details for the chat-info panel: emits immediately (once loaded) and on every change. */
  subscribeDetails(roomId: RoomId, cb: Listener<RoomDetails>): Unsubscribe;
  /**
   * Leave a room and drop it from my list. For a one-to-one chat this is "delete chat": it only
   * removes my copy; the other person keeps theirs (Matrix has no remote delete).
   */
  leave(roomId: RoomId): Promise<void>;
  /** Mute or unmute a room (no notifications, no unread badge counted as notifying). */
  setMuted(roomId: RoomId, muted: boolean): Promise<void>;
  /** Open (or reuse) a one-to-one chat with `userId`. Resolves with the room id. */
  createDirect(userId: UserId): Promise<RoomId>;
  /** Create a private group (end-to-end encrypted) and invite `invite`. */
  createGroup(opts: { name: string; invite: UserId[] }): Promise<RoomId>;
  /** Create a space: an unencrypted container that holds other rooms. */
  createSpace(opts: { name: string; topic?: string; invite?: UserId[] }): Promise<RoomId>;
  /** Join by room id (`!x:server`) or alias (`#x:server`). */
  joinRoom(idOrAlias: string): Promise<RoomId>;
}

export interface MediaOptions {
  /** Server-side thumbnail size; omit both to fetch the original file. */
  width?: number;
  height?: number;
  fit?: "crop" | "scale";
  /** Opaque encryption info from the message content (encrypted rooms). */
  encryption?: unknown;
  mimeType?: string | undefined;
}

export interface MediaApi {
  /**
   * Resolves an mxc:// URI to a URL that platform image components can load (the engine handles
   * authenticated media; on web this is a cached blob: URL). Rejects with EngineError on failure.
   */
  resolve(mxc: MxcUri, opts?: MediaOptions): Promise<string>;
  /**
   * A page of the room's media of one kind, newest first, reaching back past what the timeline has loaded. The
   * engine keeps asking the server until it has found `want` items (default 30) or reached the room's beginning,
   * so a kind that is rare does not come back as a series of empty pages. Pass `next` of the last page as `from`.
   */
  /**
   * `scan`: at most this many rounds of the room's history are looked through for the page (a round is a batch the server hands out,
   * or a back-pagination of the timeline). A preview of a few items sets it low, so a room with none of the kind is not read through to
   * its beginning; without it the page keeps going until it is full or the history ends (within the engine's own limit).
   */
  sharedPage(roomId: RoomId, opts: { kind: MediaKind; from?: string; want?: number; scan?: number }): Promise<SharedMediaPage>;
}

/** Spaces: containers that hold other rooms (MSC1772). */
export interface SpacesApi {
  /** Rooms listed in `spaceId`, in the order the space gives them. */
  children(spaceId: RoomId): Promise<SpaceChild[]>;
  /** Emits the children now, and again whenever the space's child list or a child's name or unread count changes. */
  subscribe(spaceId: RoomId, cb: Listener<SpaceChild[]>): Unsubscribe;
  /** List `roomId` in the space. */
  addChild(spaceId: RoomId, roomId: RoomId, via?: string): Promise<void>;
  /** Remove `roomId` from the space (the room itself is untouched). */
  removeChild(spaceId: RoomId, roomId: RoomId): Promise<void>;
  /** Move `roomId` to the start (`to: "first"`) or the end of the space's list. */
  moveChild(spaceId: RoomId, roomId: RoomId, to: "first" | "last"): Promise<void>;
  /** Rooms I am in that are not in this space yet, for "add existing room". */
  candidates(spaceId: RoomId): Promise<SpaceChild[]>;
}

/** Actions that span rooms rather than one timeline. */
export interface MessagesApi {
  /** Copy a message's content into another room ("forward"), keeping attachments. */
  forward(params: { fromRoomId: RoomId; eventId: EventId; toRoomId: RoomId }): Promise<void>;
}

export interface SecurityApi {
  state(): Promise<SecurityState>;
  /** Emits when the state may have changed (after sync, key import, ...). Emits the current state first. */
  onState(cb: Listener<SecurityState>): Unsubscribe;
  /** Create cross-signing keys, secret storage and key backup. Returns the recovery key to show the user once. */
  setUp(opts: { password: string }): Promise<{ recoveryKey: string }>;
  /** Unlock secret storage with the recovery key, import cross-signing secrets and restore the key backup. */
  restoreWithRecoveryKey(recoveryKey: string): Promise<void>;
}

export interface ProfileApi {
  /** Emits my profile (null when signed out): immediately, then on every change. */
  subscribe(cb: Listener<Profile | null>): Unsubscribe;
  setDisplayName(name: string): Promise<void>;
  setAvatar(file: AttachmentSource): Promise<void>;
  /** Set the status line; empty clears it. Rejects with "unsupported" on servers without custom profile fields. */
  setStatus(status: string): Promise<void>;
}

export interface RoomAdminApi {
  setName(roomId: RoomId, name: string): Promise<void>;
  /** Empty clears the topic. */
  setTopic(roomId: RoomId, topic: string): Promise<void>;
  setAvatar(roomId: RoomId, file: AttachmentSource): Promise<void>;
  /** Invite people; fails as a whole with the server's reason if one of them cannot be invited. */
  invite(roomId: RoomId, userIds: UserId[]): Promise<void>;
  /** Remove a member, or withdraw a pending invitation. */
  kick(roomId: RoomId, userId: UserId): Promise<void>;
  setRole(roomId: RoomId, userId: UserId, role: MemberRole): Promise<void>;
  /** Give someone any power level (0..100 are the usual range; a custom level such as 25 is allowed). */
  setPower(roomId: RoomId, userId: UserId, level: number): Promise<void>;
  /** Change what each action requires. Only the given fields change. */
  setThresholds(roomId: RoomId, patch: Partial<PowerThresholds>): Promise<void>;
  /** Ban someone: they are removed and cannot rejoin until unbanned. Works on people who already left. */
  ban(roomId: RoomId, userId: UserId, reason?: string): Promise<void>;
  unban(roomId: RoomId, userId: UserId): Promise<void>;
  setHistoryVisibility(roomId: RoomId, visibility: HistoryVisibility): Promise<void>;
  /** Make the room public (anyone can join) or invite-only. */
  setJoinRule(roomId: RoomId, rule: "public" | "invite"): Promise<void>;
  /**
   * Publish `#localpart:server` for the room (and make it the main address when there is none). Rejects with
   * "conflict" when the address is taken and "forbidden" when the server disallows it.
   */
  addAlias(roomId: RoomId, localpart: string): Promise<string>;
  removeAlias(roomId: RoomId, alias: string): Promise<void>;
  /** Choose which published address is the main one. */
  setMainAlias(roomId: RoomId, alias: string): Promise<void>;
}

export interface SearchApi {
  /**
   * Search message text, in one room or in all of them, newest first. The server searches the rooms it can
   * read; encrypted rooms are searched on this device, among the messages it has loaded.
   */
  messages(opts: { term: string; roomId?: RoomId; from?: string }): Promise<SearchPage>;
}

export interface DevicesApi {
  /** My sessions, current one first, then most recently active. */
  list(): Promise<DeviceInfo[]>;
  /** Sign out other sessions. Needs the account password; a wrong one rejects with "forbidden". */
  remove(deviceIds: string[], password: string): Promise<void>;
}

export interface UserDirectoryApi {
  /**
   * Find people by name or user id, excluding me. A complete user id (`@name:server`) that the
   * directory does not list is looked up directly, so anyone on the network can be reached.
   */
  search(term: string): Promise<UserSuggestion[]>;
}

export interface NotificationsApi {
  /**
   * Fires for each new message that arrives while synced (never for history, my own messages, or rooms the
   * push rules mute). The consumer decides whether to show it (window focus, user settings).
   */
  subscribe(cb: Listener<IncomingNotification>): Unsubscribe;
}

/** A live view of one room. Must be closed to release engine resources. */
export interface TimelineHandle {
  /** First message from someone else that I had not read when the timeline was opened (for the "New messages" divider). */
  readonly firstUnreadEventId: EventId | null;
  /** Immediately emits a `reset` (oldest first), then incremental updates. */
  subscribe(cb: Listener<ListUpdate<TimelineItem>[]>): Unsubscribe;
  paginateBackwards(): Promise<void>;
  /** Send plain text. `mentions` become an `m.mentions` block, so the mentioned people are notified. */
  sendText(body: string, mentions?: UserId[]): Promise<void>;
  /** Tell the room I am (or am no longer) typing. Safe to call on every keystroke: the engine throttles. */
  setTyping(typing: boolean): void;
  /** Names of the people typing right now; emits immediately and on every change. */
  onTyping(cb: Listener<string[]>): Unsubscribe;
  /** Replace the text of one of my messages. */
  edit(eventId: EventId, body: string): Promise<void>;
  /** Delete (redact) one of my messages. */
  redact(eventId: EventId): Promise<void>;
  /**
   * Upload and send a file, image, video or audio (encrypted when the room is encrypted). The upload shows up in
   * the timeline with its progress (`TimelineItem.upload`) until the message exists. Resolves when sent; rejects
   * with EngineError("unknown", "cancelled") if cancelled.
   */
  sendAttachment(file: AttachmentSource): Promise<void>;
  /** Cancel an upload in progress, or dismiss one that failed. `id` is the item's `transactionId`. */
  cancelUpload(id: string): void;
  /**
   * Send a message again that could not be sent (its status is `failed`). `id` is the item's `transactionId`. A file
   * that failed to upload is uploaded again from the copy the engine kept.
   */
  resend(id: string): Promise<void>;
  /** Drop a message that could not be sent, or dismiss a file that failed to upload. `id` is the item's `transactionId`. */
  discard(id: string): void;
  /** Send `body` as a reply to `eventId`. */
  reply(eventId: EventId, body: string, mentions?: UserId[]): Promise<void>;
  /** Pin or unpin a message in the room (needs power to send m.room.pinned_events). */
  pin(eventId: EventId, pinned: boolean): Promise<void>;
  /** Toggle my reaction `key` (an emoji) on an event. */
  react(eventId: EventId, key: string): Promise<void>;
  markRead(): Promise<void>;
  close(): void;
}

/**
 * The single boundary between UI/state and a Matrix implementation.
 * Grouped by feature so it can grow (e.g. `verification`, `media`, `spaces`, `calls`) without
 * one giant method list. New groups should be optional until every engine supports them;
 * engines throw EngineError("unsupported") for what they lack. All errors are EngineError.
 *
 * Implementations: matrix-js-sdk (web/desktop), matrix-rust-sdk (native), mock (dev/tests).
 */
export interface MatrixEngine {
  readonly auth: AuthApi;
  readonly sync: SyncApi;
  readonly rooms: RoomListApi;
  readonly media: MediaApi;
  readonly messages: MessagesApi;
  readonly spaces: SpacesApi;
  readonly security: SecurityApi;
  readonly profile: ProfileApi;
  readonly devices: DevicesApi;
  readonly roomAdmin: RoomAdminApi;
  readonly search: SearchApi;
  readonly users: UserDirectoryApi;
  readonly notifications: NotificationsApi;
  openTimeline(roomId: RoomId): TimelineHandle;
}
