import type { AttachmentSource, Preferences, Session } from "./types.js";

/** Persists the session in platform secure storage (Keychain/Keystore/safeStorage/encrypted IndexedDB). */
export interface SessionStore {
  load(): Promise<Session | null>;
  save(session: Session): Promise<void>;
  clear(): Promise<void>;
}

export type NotificationPermission = "granted" | "denied" | "default" | "unsupported";

/** System notifications (Web Notification API, Electron, APNs/FCM local display...). */
export interface SystemNotifications {
  permission(): NotificationPermission;
  /** Ask the OS/browser for permission; must be called from a user gesture on the web. */
  request(): Promise<NotificationPermission>;
  /** True while the app window is visible and focused, i.e. the user is already looking at it. */
  isActive(): boolean;
  /** Same `tag` replaces an earlier notification (one per chat). `onClick` should bring the app to the front. */
  show(n: { title: string; body: string; tag: string; onClick: () => void }): void;
}

/** What a finished recording hands back: a file ready to send, with the facts the recorder measured itself. */
export interface RecordedMedia extends AttachmentSource {
  durationMs: number;
}

/**
 * A microphone or camera that has been opened (permission granted) and is ready: `preview` can already be shown,
 * and recording begins with `start()`.
 */
export interface Recorder {
  readonly kind: "audio" | "video";
  /** Begin recording. */
  start(): void;
  /** A live preview source for video recordings (on web a MediaStream); opaque to shared code. */
  readonly preview?: unknown;
  /** Loudness 0..1 about ten times a second while recording; returns an unsubscribe. */
  onLevel(cb: (level: number) => void): () => void;
  /** Stop and return the recording. */
  stop(): Promise<RecordedMedia>;
  /** Stop and throw the recording away; releases the microphone/camera. */
  cancel(): void;
}

/** Why a recording could not start. */
export class RecordError extends Error {
  constructor(
    readonly reason: "denied" | "unsupported" | "no_device",
    message: string,
  ) {
    super(message);
    this.name = "RecordError";
  }
}

/** Persists user preferences (localStorage / AsyncStorage / settings file). */
export interface PreferencesStore {
  load(): Promise<Partial<Preferences>>;
  save(prefs: Preferences): Promise<void>;
}

/**
 * Capabilities the platform shell injects into the shared app. Grow this only when shared code
 * needs a native capability (e.g. `notifications`, `filePicker`, `openExternal`).
 */
export interface PlatformServices {
  sessionStore: SessionStore;
  notifications?: SystemNotifications;
  /** Record a voice message or a short video. Absent = the record buttons are hidden. Rejects with RecordError. */
  recordMedia?(kind: "audio" | "video"): Promise<Recorder>;
  /** Absent = preferences live only for this run. */
  preferences?: PreferencesStore;
  /** Let the user choose files to send. Absent = the attach button is hidden. */
  pickFiles?(): Promise<AttachmentSource[]>;
  /**
   * Receive files dropped onto the window or pasted from the clipboard. `onHover(true)` while files
   * are dragged over the window. Returns the unsubscribe function. Absent = no drop/paste.
   */
  receiveFiles?(onFiles: (files: AttachmentSource[]) => void, onHover: (over: boolean) => void): () => void;
  /** Open a link outside the app (a browser tab). Absent = links are inert. */
  openLink?(url: string): void;
  /** Save/open a resolved file URL (e.g. trigger a browser download). */
  saveFile?(file: { url: string; name: string }): Promise<void>;
}
