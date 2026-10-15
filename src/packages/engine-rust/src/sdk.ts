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
  details(): Promise<RawRoomDetails>;
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
}

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
  sendText(body: string): Promise<void>;
  markRead(): Promise<void>;
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
}

export interface SdkClientConfig {
  homeserverUrl: string;
  dataDir: string;
  cacheDir: string;
  passphrase: string;
}

/** The SDK: makes a client. Everything else is reached through it. */
export interface Sdk {
  newClient(config: SdkClientConfig): Promise<SdkClient>;
  /** The sliding sync setting a new client uses (the one the server supports natively is found out at login). */
  defaultSlidingSync: unknown;
}
