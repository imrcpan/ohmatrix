import type { ListUpdate } from "./diff.js";
import type {
  AttachmentSource,
  RoomDetails,
  Profile,
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
  /** Open (or reuse) a one-to-one chat with `userId`. Resolves with the room id. */
  createDirect(userId: UserId): Promise<RoomId>;
  /** Create a private group (end-to-end encrypted) and invite `invite`. */
  createGroup(opts: { name: string; invite: UserId[] }): Promise<RoomId>;
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
}

/** A live view of one room. Must be closed to release engine resources. */
export interface TimelineHandle {
  /** First message from someone else that I had not read when the timeline was opened (for the "New messages" divider). */
  readonly firstUnreadEventId: EventId | null;
  /** Immediately emits a `reset` (oldest first), then incremental updates. */
  subscribe(cb: Listener<ListUpdate<TimelineItem>[]>): Unsubscribe;
  paginateBackwards(): Promise<void>;
  sendText(body: string): Promise<void>;
  /** Replace the text of one of my messages. */
  edit(eventId: EventId, body: string): Promise<void>;
  /** Delete (redact) one of my messages. */
  redact(eventId: EventId): Promise<void>;
  /** Upload and send a file or image (encrypted when the room is encrypted). */
  sendAttachment(file: AttachmentSource): Promise<void>;
  /** Send `body` as a reply to `eventId`. */
  reply(eventId: EventId, body: string): Promise<void>;
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
  readonly security: SecurityApi;
  readonly profile: ProfileApi;
  openTimeline(roomId: RoomId): TimelineHandle;
}
