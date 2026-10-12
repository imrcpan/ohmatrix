/** Platform-agnostic domain model. No Matrix SDK types leak out of engines. */

export type UserId = string; // @user:server
export type RoomId = string; // !opaque:server
export type EventId = string; // $opaque
export type MxcUri = string; // mxc://server/mediaId

export interface Session {
  homeserver: string;
  userId: UserId;
  deviceId: string;
  accessToken: string;
}

export interface RoomSummary {
  id: RoomId;
  name: string;
  avatarUrl?: string;
  avatar?: MxcUri;
  /** Pending invitation: not joined yet; `inviter` is the display name of who invited me. */
  invite?: { inviter: string };
  /** Names of people currently typing in this room (never includes me). */
  typing?: string[];
  /** Notifications are muted for this room. */
  muted?: boolean;
  /** Pinned chats float to the top of the list. */
  pinned?: boolean;
  /** Manually marked unread (shows a badge even with no unread messages). */
  markedUnread?: boolean;
  isDirect: boolean;
  /** Joined member count (including me); 0 if unknown. */
  memberCount: number;
  unreadCount: number;
  highlightCount: number;
  lastMessage?: TimelineItem;
  /** Milliseconds since epoch of the latest activity; used for ordering. */
  lastActivityTs: number;
}

export type MessageContent =
  | { kind: "text"; body: string; formattedBody?: string }
  | { kind: "image"; url: MxcUri; width?: number; height?: number; body: string; mimeType?: string; encryption?: unknown }
  | { kind: "file"; url: MxcUri; name: string; size?: number; mimeType?: string; encryption?: unknown }
  /** Membership/name/topic changes etc., rendered centered like Telegram service messages. */
  | { kind: "service"; body: string }
  /** Encrypted event we could not (yet) decrypt: missing keys until verification/backup restore. */
  | { kind: "undecryptable" }
  | { kind: "unsupported"; body: string };

export interface ReactionSummary {
  key: string; // emoji
  count: number;
  mine: boolean;
}

export interface Reader {
  userId: UserId;
  name: string;
}

export interface TimelineItem {
  id: EventId;
  /** Local echo id while sending; equals `id` once acknowledged. */
  transactionId?: string;
  roomId: RoomId;
  sender: UserId;
  senderName: string;
  senderAvatar?: MxcUri;
  isOwn: boolean;
  ts: number;
  content: MessageContent;
  reactions?: ReactionSummary[];
  /** On my own messages: the other people who have read up to this message. */
  readBy?: Reader[];
  edited?: boolean;
  /** This message replies to another; `preview` is plain text of the original. */
  replyTo?: { id: EventId; senderName: string; sender: UserId; preview: string };
  status: "sending" | "sent" | "failed";
}

export type SyncState = "stopped" | "connecting" | "syncing" | "error";

/** Plain-text rendering of any content, for previews and fallbacks. */
export function contentText(c: MessageContent): string {
  return c.kind === "file" ? c.name : c.kind === "undecryptable" ? "🔒 Unable to decrypt this message" : c.body;
}

/**
 * - `unavailable`: encryption not initialised (unsupported engine/platform)
 * - `needs_setup`: account has no cross-signing / recovery key yet
 * - `needs_recovery`: account is set up elsewhere; this device needs the recovery key to read history
 * - `ready`: this device can read and send encrypted messages and has its secrets
 */
export type SecurityState = "unavailable" | "needs_setup" | "needs_recovery" | "ready";

/** A user-chosen file ready to send. `data` is the platform handle (a Blob on web). */
export interface AttachmentSource {
  name: string;
  mimeType: string;
  size: number;
  data: unknown;
}

/** User-chosen settings, persisted per device (not per account). */
export interface Preferences {
  /** A registered theme id, or "system" to follow the OS. */
  theme: string;
  /** Interface language; null = detect from the system. */
  locale: "en" | "zh-CN" | null;
  /** Landscape chat-list width in px; null = automatic. */
  sidebarWidth: number | null;
  /** Show system notifications for new messages (opt-in; needs the OS permission). */
  notifications: boolean;
  /** Include the message text in notifications (off = just "New message"). */
  notificationPreview: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = { theme: "system", locale: null, sidebarWidth: null, notifications: false, notificationPreview: true };

/** The signed-in user's own profile. */
export interface Profile {
  userId: UserId;
  displayName: string;
  avatar?: MxcUri;
  /** Free-text status line shown on the profile (a custom profile field). */
  status?: string;
}

/** One login session (device) of the account. */
export interface DeviceInfo {
  id: string;
  name: string;
  /** Milliseconds since epoch of the last request seen from it. */
  lastSeenTs?: number;
  lastSeenIp?: string;
  /** This is the session the app is running as. */
  current: boolean;
}

export type MemberRole = "admin" | "moderator" | "member";

export interface RoomMember {
  userId: UserId;
  name: string;
  avatar?: MxcUri;
  role: MemberRole;
  /** Invited people are listed but have not joined yet. */
  invited?: boolean;
}

/** Everything the chat-info panel shows. */
export interface RoomDetails {
  id: RoomId;
  name: string;
  topic?: string;
  avatar?: MxcUri;
  /** Canonical alias like #room:server, when the room has one. */
  alias?: string;
  isDirect: boolean;
  isEncrypted: boolean;
  members: RoomMember[];
  /** Notifications are muted for this room. */
  muted: boolean;
  me: UserId;
  myRole: MemberRole;
  /** What I am allowed to do here, according to the room's power levels. */
  can: { editInfo: boolean; invite: boolean; kick: boolean; changeRoles: boolean };
}

/** A person found in the user directory (or looked up by full user id). */
export interface UserSuggestion {
  userId: UserId;
  displayName: string;
  avatar?: MxcUri;
}

/** A live incoming message that the account's push rules say should notify. */
export interface IncomingNotification {
  eventId: EventId;
  roomId: RoomId;
  roomName: string;
  isDirect: boolean;
  senderName: string;
  /** Plain-text preview; absent when the message could not be decrypted. */
  preview?: string;
  /** Mentions me or matches a keyword rule. */
  highlight: boolean;
}
