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

/**
 * Why a message cannot be read, as far as the engine can tell: `waiting` its key has not reached this device (and may yet), `beforeJoin` it
 * was sent before the account was in the room, `noBackup` it is older than this device and there is no key backup to read it from, `unverified`
 * a backup exists but this device cannot use it until it is verified, `withheld` the sender chose not to give this device the key.
 */
export type UndecryptableReason = "waiting" | "beforeJoin" | "noBackup" | "unverified" | "withheld";

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
  | {
      kind: "image";
      url: MxcUri;
      width?: number;
      height?: number;
      body: string;
      mimeType?: string;
      encryption?: unknown;
      /** A sticker (`m.sticker`): drawn on its own, with no bubble around it. */
      sticker?: boolean;
    }
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
  /** Encrypted event we could not (yet) decrypt: its key is missing; `reason` is the engine's best guess why (absent = it does not know). */
  | { kind: "undecryptable"; reason?: UndecryptableReason }
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

/** The picture a reply quotes, when the original is a photo: shown as a small thumbnail instead of its file name. */
export interface ReplyImage {
  url: MxcUri;
  width?: number;
  height?: number;
  mimeType?: string;
  encryption?: unknown;
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
  /**
   * The other people whose read receipt sits on this message (so they have read up to it). An engine may give it for any message;
   * `spreadReceipts` makes it complete for my own messages: everyone at or after them.
   */
  readBy?: Reader[];
  /** Present while the file is still being uploaded (the message does not exist on the server yet). */
  upload?: UploadState;
  edited?: boolean;
  /** Pinned in the room (m.room.pinned_events). */
  pinned?: boolean;
  /** This message replies to another; `preview` is plain text of the original. */
  replyTo?: { id: EventId; senderName: string; sender: UserId; preview: string; image?: ReplyImage };
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

/** One of the seven pictures of a verification: the symbol to look at and its name in English (the translation is the app's). */
export interface VerificationEmoji {
  symbol: string;
  name: string;
}

/**
 * Where a verification stands, one at a time. `userId` is who is being verified (me, for a session of my own).
 * - `requested`: asked and not yet accepted (`incoming`: by the other side, so the app asks me; else I am waiting for them)
 * - `waiting`: accepted; the pictures are being exchanged
 * - `emojis`: the same seven pictures must show on both devices; `confirm` if they do, `mismatch` if not
 * - `done`: verified. `cancelled`: the other side stopped it. `failed`: it broke (a timeout, a mismatch, an error)
 */
export type VerificationFlow =
  | { phase: "requested"; incoming: boolean; userId: UserId; deviceName?: string }
  | { phase: "waiting"; userId: UserId }
  | { phase: "emojis"; userId: UserId; emojis: VerificationEmoji[] }
  | { phase: "done"; userId: UserId }
  | { phase: "cancelled"; userId: UserId }
  | { phase: "failed"; userId: UserId };

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
  locale: string | null;
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
  /** Pull the chat list down to refresh it (off by default; Advanced options). */
  pullToRefresh: boolean;
  /** The server last signed in to (as typed), offered again on the sign-in screen; null = none yet. */
  lastHomeserver: string | null;
  /** Servers added to Explore by name (`kde.org`), whose public rooms it can list; in the order they were added. */
  exploreServers: string[];
  /** The interface's font, by the name of an installed one; null = the system's own. Offered only where the platform can list its fonts. */
  font: string | null;
  /** The sticker group last on show in the picker, opened again next time; null = none yet. A group that is gone is not opened. */
  stickerGroup: string | null;
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
  pullToRefresh: false,
  lastHomeserver: null,
  exploreServers: [],
  font: null,
  stickerGroup: null,
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
  /** What the server says of a room that is not joined, for the card shown when it is pressed. */
  topic?: string;
  alias?: string;
  /** Joined members, as the server counts them. */
  members?: number;
  /** The server has answered about this room (the topic and the count above are all it knows): until then they are only not known yet. */
  detailed?: boolean;
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
/** A room listed in the server's public directory. */
export interface PublicRoom {
  roomId: RoomId;
  name: string;
  topic?: string;
  /** The room's main address, `#name:server`; joining by it works for rooms on any server. */
  alias?: string;
  avatar?: MxcUri;
  members: number;
}

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

/** One sticker of my own pack (`im.ponies.user_emotes`, MSC2545). */
export interface Sticker {
  /** The name it is listed under, unique in the pack. */
  shortcode: string;
  url: MxcUri;
  mimeType: string;
  width?: number;
  height?: number;
  size?: number;
}

/** The most one sticker may weigh (bytes): a larger file is refused, not shrunk. */
export const STICKER_MAX_BYTES = 3 * 1024 * 1024;

/** A sticker group's cover: a standard emoji or a small picture. */
export type StickerGroupIcon = { kind: "emoji"; emoji: string } | { kind: "image"; url: MxcUri; mimeType: string };

/**
 * A group of my stickers (kept in the account, so on every device): a name (empty = the default, "Group n"), a cover, and the stickers in it
 * by name, in order. A group with no cover shows its first sticker, or a smiling face when it has none. A sticker is in one group at most.
 */
export interface StickerGroup {
  id: string;
  name: string;
  icon?: StickerGroupIcon;
  stickers: string[];
}

/** The id of the group that holds the stickers no other group has. It is a group like the others, shown only while it has something (see `withUngrouped`). */
export const STICKER_DEFAULT_GROUP = "default";

/** The cover a group has when none was chosen and it has no sticker yet. */
export const STICKER_GROUP_FALLBACK_EMOJI = "😊";

/** The most groups a pack may have besides the one of the stickers that have no group. */
export const STICKER_GROUPS_MAX = 12;

/** What a call is doing, in the order it goes: ringing (someone is being called, or is calling me), connecting, talking, over. */
export type CallPhase = "ringing" | "connecting" | "connected" | "ended";

/** Why a call is over, for the line the call screen leaves behind; `hangup` is either side putting the phone down, `rejected` is the other side turning my call down, `cancelled` is the caller giving up on a call that was ringing for me. */
export type CallEndReason = "hangup" | "rejected" | "cancelled" | "busy" | "unanswered" | "failed" | "no_media";

/** A live stream of a call, for a platform's video element to show (a `MediaStream` in a browser; opaque to everything but the platform). */
export type CallStream = unknown;

/** A one-to-one call, as the screen shows it. `incoming` is a call that has not been answered yet (by me). */
export interface CallState {
  /** Different for every call. */
  id: string;
  roomId: RoomId;
  /** The other person. */
  peer: { userId: UserId; name: string; avatar?: MxcUri };
  video: boolean;
  incoming: boolean;
  phase: CallPhase;
  /** Set once `phase` is "ended". */
  endReason?: CallEndReason;
  /** My microphone is off. */
  muted: boolean;
  /** My camera is off (always true for a voice call). */
  cameraOff: boolean;
  /** The other side's camera is off (its picture is not coming), so the screen shows the person instead of a black picture. */
  remoteCameraOff: boolean;
  /** I am showing my screen to the other side. */
  sharing: boolean;
  /** The other side is showing its screen (`remote` is then that screen). */
  remoteSharing: boolean;
  /** The connection is shaky right now (it dropped and is being brought back). */
  poor: boolean;
  /**
   * The picture is not coming through and something is being done about it, or nothing more can be: `switching` while another video codec
   * is being tried (a few seconds, so that the person is not left waiting at a black picture without being told), `unavailable` when none is
   * left to try. Absent when the picture is fine.
   */
  videoNotice?: "switching" | "unavailable";
  /** The sound is coming out of the loudspeaker (a phone; absent where the device has no choice of that). */
  speaker?: boolean;
  /** When the call was picked up (ms since epoch), for the clock on the screen. */
  connectedAt?: number;
  /** The other side's picture and sound, once there is one. */
  remote?: CallStream;
  /** My own camera, for the small picture, once there is one. */
  local?: CallStream;
}

/** A microphone or a camera the call can use. */
export interface CallDevice {
  id: string;
  label: string;
  /** The one in use now. */
  current: boolean;
}
