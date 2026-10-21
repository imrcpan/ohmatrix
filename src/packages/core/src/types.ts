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
  /** What only the engine that made the session needs to restore it (an opaque string; the others ignore it). */
  native?: string;
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
  /** A space (m.space), not a chat: it holds other rooms and is shown with a rounded-square logo. */
  isSpace?: boolean;
  /** Rooms that are children of this space, most recently active first (only for a space I am in). */
  spaceChildren?: SpaceChild[];
  /** Joined member count (including me); 0 if unknown. */
  memberCount: number;
  unreadCount: number;
  highlightCount: number;
  lastMessage?: TimelineItem;
  /** Milliseconds since epoch of the latest activity; used for ordering. */
  lastActivityTs: number;
}

/** A link found in a message body, with the server's open-graph preview (Matrix `m.mentions`-era `com.beeper.linkpreviews` style). */
export type LinkPreview = {
  url: string;
  title?: string;
  description?: string;
  /** Preview image, as an mxc:// URI. */
  image?: MxcUri;
  imageWidth?: number;
  imageHeight?: number;
  siteName?: string;
};

export type MessageContent =
  | {
      kind: "text";
      body: string;
      /** HTML body, when the sender sent one; rendered as rich text (never as raw HTML). */
      formattedBody?: string;
      /** Users mentioned with @name; kept so mentions can be highlighted and counted. */
      mentions?: UserId[];
      /** This message mentions me. */
      mentionsMe?: boolean;
      /** Link previews for the URLs in the body, when the server could fetch them. */
      previews?: LinkPreview[];
    }
  | { kind: "image"; url: MxcUri; width?: number; height?: number; body: string; mimeType?: string; encryption?: unknown }
  | { kind: "file"; url: MxcUri; name: string; size?: number; mimeType?: string; encryption?: unknown }
  | {
      kind: "video";
      url: MxcUri;
      name: string;
      width?: number;
      height?: number;
      durationMs?: number;
      size?: number;
      mimeType?: string;
      encryption?: unknown;
      thumbnail?: { url: MxcUri; encryption?: unknown; mimeType?: string };
    }
  /** Audio file or voice message (`voice`: recorded in the app, shown as a bubble with a waveform). */
  | {
      kind: "audio";
      url: MxcUri;
      name: string;
      durationMs?: number;
      size?: number;
      mimeType?: string;
      encryption?: unknown;
      voice?: boolean;
      waveform?: number[];
    }
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
  /** Present while the file is still being uploaded (the message does not exist on the server yet). */
  upload?: UploadState;
  edited?: boolean;
  /** Pinned in the room (m.room.pinned_events). */
  pinned?: boolean;
  /** This message replies to another; `preview` is plain text of the original. */
  replyTo?: { id: EventId; senderName: string; sender: UserId; preview: string };
  status: "sending" | "sent" | "failed";
}

export type SyncState = "stopped" | "connecting" | "syncing" | "error";

/** Plain-text rendering of any content, for previews and fallbacks. */
export function contentText(c: MessageContent): string {
  return c.kind === "file" || c.kind === "video" || c.kind === "audio" ? c.name : c.kind === "undecryptable" ? "🔒 Unable to decrypt this message" : c.body;
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
  /** Known playing time (a recording knows it better than the file header does). */
  durationMs?: number;
  /** Amplitude samples 0..1 of a voice message, for drawing its waveform. */
  waveform?: number[];
  /** Send audio as a voice message. */
  voice?: boolean;
  width?: number;
  height?: number;
  /** A blurhash of a picture, for the placeholder shown while it loads; the phone computes it, the browser leaves it out. */
  blurhash?: string;
}

/** A file being uploaded: shown in the timeline until the message is sent. */
export interface UploadState {
  /** 0..1. */
  progress: number;
  loaded: number;
  total: number;
  /** Local picture to show while it uploads (images and video posters). */
  previewUrl?: string;
  /** The upload failed; the item stays until dismissed. */
  failed?: boolean;
}

/** User-chosen settings, persisted per device (not per account). */
export interface Preferences {
  /** A registered theme id, or "system" to follow the OS. */
  theme: string;
  /** Interface language; null = detect from the system. */
  locale: "en" | "zh-CN" | null;
  /** Landscape chat-list width in px; null = automatic. */
  sidebarWidth: number | null;
  /** Whole-interface zoom factor (1 = 100%). */
  uiScale: number;
  /** Show system notifications for new messages (opt-in; needs the OS permission). */
  notifications: boolean;
  /** Include the message text in notifications (off = just "New message"). */
  notificationPreview: boolean;
  /** My messages wear the theme's accent colour; off, they look like everybody else's bubbles. */
  ownBubbleAccent: boolean;
  /** Push through FCM, so a message arrives with the app closed (Android only; on by default). */
  pushEnabled: boolean;
  /** The server last signed in to (as typed), offered again on the sign-in screen; null = none yet. */
  lastHomeserver: string | null;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  locale: null,
  sidebarWidth: null,
  uiScale: 1,
  notifications: false,
  notificationPreview: true,
  ownBubbleAccent: true,
  pushEnabled: true,
  lastHomeserver: null,
};

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

/** The kinds of shared media a room's gallery can be filtered by. Voice messages belong to "audio". */
export type MediaKind = "image" | "video" | "audio" | "file";

/** One page of a room's media, newest first. `next` is where the following page starts; absent = the room's beginning. */
export interface SharedMediaPage {
  items: TimelineItem[];
  next?: string;
}

/** A room listed inside a space. */
export interface SpaceChild {
  roomId: RoomId;
  name: string;
  avatar?: MxcUri;
  /** It is a space itself, so it can be opened to show what it holds. */
  isSpace: boolean;
  /** Set before the room is joined; the server's view of a space we only partly know. */
  via?: string[];
  unreadCount: number;
  highlightCount: number;
}

export type MemberRole = "admin" | "moderator" | "member";

export interface RoomMember {
  userId: UserId;
  name: string;
  avatar?: MxcUri;
  role: MemberRole;
  /** The raw power level; `role` is the nearest named level at or below it. Custom levels (e.g. 25) show as the number. */
  power: number;
  /** Invited people are listed but have not joined yet. */
  invited?: boolean;
}

/** Who can read the room's history: from now on for new members (`joined`), from their invite, all of it, or anyone. */
export type HistoryVisibility = "shared" | "invited" | "joined" | "world_readable";

/** How people get in. `knock` and `restricted` exist on servers but are only shown, not offered. */
export type JoinRule = "public" | "invite" | "knock" | "restricted" | "other";

/** The power level an action needs (m.room.power_levels). Anyone at or above it may do the action. */
export interface PowerThresholds {
  invite: number;
  kick: number;
  ban: number;
  /** Delete other people's messages. */
  redact: number;
  /** Send messages and reactions. */
  sendMessages: number;
  /** Change room settings: name, topic, avatar, history, join rule, addresses. */
  changeSettings: number;
  /** Change the levels themselves. */
  changeLevels: number;
}

export interface BannedMember {
  userId: UserId;
  name: string;
  reason?: string;
}

/** Everything the chat-info panel shows. */
export interface RoomDetails {
  id: RoomId;
  name: string;
  topic?: string;
  avatar?: MxcUri;
  /** Canonical (main) alias like #room:server, when the room has one. */
  alias?: string;
  /** All published addresses of the room, the main one first. */
  aliases: string[];
  joinRule: JoinRule;
  historyVisibility: HistoryVisibility;
  levels: PowerThresholds;
  banned: BannedMember[];
  /**
   * The people are still being read: `members` and `banned` are empty for now, and the details are sent again with them. In a room of
   * thousands that takes a while, and the rest of the chat info does not wait for it.
   */
  peopleLoading?: boolean;
  isDirect: boolean;
  isEncrypted: boolean;
  members: RoomMember[];
  /** Notifications are muted for this room. */
  muted: boolean;
  me: UserId;
  myRole: MemberRole;
  /** Event ids pinned in the room, newest last. */
  pinnedEventIds: EventId[];
  /** What I am allowed to do here, according to the room's power levels. */
  can: {
    editInfo: boolean;
    invite: boolean;
    kick: boolean;
    ban: boolean;
    changeRoles: boolean;
    pin: boolean;
    /** Join rule, history visibility and addresses. */
    changeSettings: boolean;
  };
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

/** One message found by a search. */
export interface SearchResult {
  eventId: EventId;
  roomId: RoomId;
  roomName: string;
  sender: UserId;
  senderName: string;
  ts: number;
  /** Plain text of the message. */
  text: string;
  /** Found on this device (an encrypted room) rather than by the server. */
  local: boolean;
}

export interface SearchPage {
  results: SearchResult[];
  /** Pass back as `from` to get more server results; absent when there are no more. */
  next?: string;
  /** Number of encrypted rooms that were searched only among the messages loaded on this device. */
  localRooms: number;
}
