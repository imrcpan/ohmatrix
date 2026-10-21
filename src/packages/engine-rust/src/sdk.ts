/**
 * What the engine needs from matrix-rust-sdk, as small interfaces in our own words. The one place that touches the
 * generated bindings is `sdkFromBindings` (sdkBindings.ts), and it is type-checked against them, so a change in the
 * SDK's API stops the build there. Everything else, the engine and its tests, sees only this.
 *
 * Numbered enums of the bindings are plain strings here, and `bigint` counts are numbers, so nothing above this layer
 * needs to know what a binding looks like.
 */
import type { EventItemLike } from "./timelineItem.js";
import type { RoomInfoLike } from "./roomSummary.js";
import type { RawSecurity } from "./security.js";

export interface SdkSession {
  accessToken: string;
  refreshToken?: string | undefined;
  userId: string;
  deviceId: string;
  homeserverUrl: string;
  oauthData?: string | undefined;
  slidingSyncVersion: unknown;
}

/** One change to an observed list, with the elements already turned into ours. */
export type ListChange<T> = { tag: string; inner?: { values?: T[]; value?: T; index?: number; length?: number } | undefined };

/** A cancellable subscription. */
export interface SdkTask {
  cancel(): void;
}

export interface SdkRoom {
  id(): string;
  /** The room's info now, as a chat list row is made from it. */
  info(): Promise<RoomInfoLike>;
  /** Calls `cb` whenever the info changes. */
  onInfo(cb: (info: RoomInfoLike) => void): SdkTask;
  /** The newest event, as far as a chat list shows it. */
  latest(): Promise<LatestEvent>;
  onTyping(cb: (userIds: string[]) => void): SdkTask;
  typingNotice(typing: boolean): Promise<void>;
  timeline(): Promise<SdkTimeline>;
  /** What the chat-info panel shows, read now. */
  /** `people: false` leaves out the members (reading thousands of them takes a while); `members` is then empty. */
  details(opts?: { people?: boolean }): Promise<RawRoomDetails>;
  leave(): Promise<void>;
  setName(name: string): Promise<void>;
  setTopic(topic: string): Promise<void>;
  invite(userId: string): Promise<void>;
  kick(userId: string): Promise<void>;
  ban(userId: string, reason?: string): Promise<void>;
  unban(userId: string): Promise<void>;
  setPower(userId: string, level: number): Promise<void>;
  /** Only the given levels change. */
  setLevels(patch: Partial<RawLevels>): Promise<void>;
  setJoinRule(rule: "public" | "invite"): Promise<void>;
  setHistoryVisibility(visibility: "shared" | "invited" | "joined" | "world_readable"): Promise<void>;
  /** Accept an invitation. */
  join(): Promise<void>;
  /** Send the read receipt for everything and clear a manual unread mark. */
  markRead(): Promise<void>;
  setFavourite(favourite: boolean): Promise<void>;
  setUnreadFlag(unread: boolean): Promise<void>;
  /** Send the messages that waited for the network or failed (the room's send queue is switched on again). */
  retrySending(): Promise<void>;
  setAvatar(mimeType: string, data: ArrayBuffer): Promise<void>;
  /** Send an event of any type, its content as JSON. */
  sendRaw(eventType: string, content: string): Promise<void>;
}

/** An event of a timeline: the server's id, or the id the local echo has until the server gives one. */
export type EventRef = { eventId: string; transactionId?: undefined } | { transactionId: string; eventId?: undefined };

/** The levels a room's actions need, as numbers. `stateDefault` is what changing settings and levels needs. */
export interface RawLevels {
  invite: number;
  kick: number;
  ban: number;
  redact: number;
  eventsDefault: number;
  stateDefault: number;
}

export interface RawMember {
  userId: string;
  displayName?: string | undefined;
  avatarUrl?: string | undefined;
  membership: "Join" | "Invite" | "Ban" | "Other";
  /** The power level; an unbounded one (a room's creator) is read as 100. */
  power: number;
  /** Why they were banned or removed. */
  reason?: string | undefined;
}

/** What the SDK knows of a room that the chat-info panel is made from (see `toRoomDetails`). */
export interface RawRoomDetails {
  id: string;
  name: string;
  topic?: string | undefined;
  avatarUrl?: string | undefined;
  canonicalAlias?: string | undefined;
  alternativeAliases: string[];
  /** The tag of the SDK's join rule (`Public`, `Invite`, `Knock`, ...), when the room has one. */
  joinRule?: string | undefined;
  historyVisibility: string;
  isDirect: boolean;
  isEncrypted: boolean;
  muted: boolean;
  pinnedEventIds: string[];
  me: string;
  members: RawMember[];
  levels: RawLevels;
  can: {
    invite: boolean;
    kick: boolean;
    ban: boolean;
    pin: boolean;
    editName: boolean;
    editTopic: boolean;
    joinRules: boolean;
    history: boolean;
    levels: boolean;
  };
}

/** What a chat list shows of a room's newest event. */
export type LatestEvent = { item: EventItemLike } | { item?: undefined };

export interface SdkTimeline {
  /** Calls `cb` with each batch of changes; the first batch is the whole timeline (a `Reset`). */
  onChanges(cb: (changes: ListChange<TimelineEntry>[]) => void): Promise<SdkTask>;
  /** Reads `count` older events; resolves to whether the start of the room has been reached. */
  paginateBackwards(count: number): Promise<boolean>;
  sendText(body: string, mentions?: string[]): Promise<void>;
  reply(eventId: string, body: string, mentions?: string[]): Promise<void>;
  edit(ref: EventRef, body: string): Promise<void>;
  redact(ref: EventRef): Promise<void>;
  /** Toggle my reaction. */
  react(ref: EventRef, key: string): Promise<void>;
  pin(eventId: string, pinned: boolean): Promise<void>;
  markRead(): Promise<void>;
  /** An event of this timeline by its id, when the room has it (or can fetch it). */
  item(eventId: string): Promise<EventItemLike>;
  /** Whether the whole room has been read (by `paginateBackwards`) is told by its result; this is for the start. */
  /** Upload a file from the device and send it. Resolves when it is sent. */
  sendMedia(file: {
    kind: "image" | "video" | "audio" | "file";
    path: string;
    name: string;
    mimeType: string;
    size: number;
    width?: number;
    height?: number;
    blurhash?: string;
    durationMs?: number;
    waveform?: number[];
    voice?: boolean;
  }): Promise<void>;
}

/** The account's encryption: what stands, and the two things a person does about it. */
export interface SdkSecurity {
  read(): Promise<RawSecurity>;
  /** Calls `cb` whenever something may have changed (recovery, verification or the backup). */
  onChange(cb: () => void): SdkTask;
  /** Set up recovery (and the keys it needs); resolves with the recovery key to show once. */
  setUp(password: string): Promise<string>;
  recover(recoveryKey: string): Promise<void>;
}

/** One message a search found. */
export interface RawHit {
  roomId: string;
  eventId: string;
  sender: string;
  senderName?: string | undefined;
  ts: number;
  text: string;
}

/** A search in progress: each call gives the next batch, `undefined` at the end. */
export interface SdkSearch {
  next(): Promise<RawHit[] | undefined>;
}

export interface RawProfile {
  userId: string;
  displayName?: string | undefined;
  avatarUrl?: string | undefined;
}

/** An entry of a timeline: an event we show, or something the SDK adds that we do not (day dividers, the read marker). */
export type TimelineEntry = { event: EventItemLike } | { event?: undefined };

export interface SdkSyncService {
  start(): Promise<void>;
  stop(): Promise<void>;
  /** The state now and on every change. */
  onState(cb: (state: "Idle" | "Running" | "Terminated" | "Error" | "Offline") => void): SdkTask;
  /** The chat list: the rooms in order, as the SDK delivers them. Resolves once subscribed. */
  rooms(cb: (changes: ListChange<SdkRoom>[]) => void): Promise<SdkTask & { loadMore(): void }>;
}

export interface SdkClient {
  userId(): string;
  session(): SdkSession;
  login(username: string, password: string, deviceName: string): Promise<void>;
  restore(session: SdkSession): Promise<void>;
  logout(): Promise<void>;
  syncService(): Promise<SdkSyncService>;
  /** My name and picture. */
  profile(): Promise<{ displayName?: string | undefined; avatarUrl?: string | undefined }>;
  room(id: string): SdkRoom | undefined;
  /** Mute a room, or give it the account's default again. */
  setMuted(roomId: string, muted: boolean): Promise<void>;
  /** An HTTP pusher in the `event_id_only` format, replacing one with the same app id and key; and taking one away. */
  setPusher(p: { appId: string; pushKey: string; gatewayUrl: string; appName: string; deviceName: string; lang: string }): Promise<void>;
  deletePusher(p: { appId: string; pushKey: string }): Promise<void>;
  /** Make a room and resolve with its id. */
  createRoom(opts: { name: string; topic?: string; invite: string[]; encrypted: boolean; space: boolean; direct: boolean }): Promise<string>;
  /** Join by room id or alias; resolves with the room id. */
  joinRoom(idOrAlias: string): Promise<string>;
  /** The one-to-one chat with a user, if there is one. */
  directRoom(userId: string): string | undefined;
  searchUsers(term: string, limit: number): Promise<RawProfile[]>;
  /** Add a person to the account's ignored users. */
  ignoreUser(userId: string): Promise<void>;
  /** One user's profile; rejects when there is no such user. */
  userProfile(userId: string): Promise<RawProfile>;
  setDisplayName(name: string): Promise<void>;
  setAvatar(mimeType: string, data: ArrayBuffer): Promise<void>;
  security(): SdkSecurity;
  /** Search message text in one room, or in all of them. */
  search(term: string, roomId?: string): SdkSearch;
  /**
   * A URL the app's image and video components can load for a media address. `source` is what the message carried to
   * open an encrypted file; a size asks for a thumbnail.
   */
  mediaUrl(mxc: string, opts: { source?: string; width?: number; height?: number; mimeType?: string }): Promise<string>;
  /** Let go of the files `mediaUrl` kept on disk; their URLs stop working. */
  releaseMedia?(): void;
}

export interface SdkClientConfig {
  homeserverUrl: string;
  dataDir: string;
  cacheDir: string;
  /** The 32-byte key the stores are encrypted with. */
  key: ArrayBuffer;
  /** Opening a saved session: nothing may need the network (the server's features are already in the session). */
  restoring?: boolean;
}

/** The SDK: makes a client. Everything else is reached through it. */
export interface Sdk {
  newClient(config: SdkClientConfig): Promise<SdkClient>;
  /** The sliding sync setting a new client uses (the one the server supports natively is found out at login). */
  defaultSlidingSync: unknown;
}
