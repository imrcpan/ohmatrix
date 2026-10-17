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

/** One audio clip being played: the part of a browser audio element the app uses, which a phone's player can stand in for. */
export interface AudioClip {
  /** Seconds. Setting it jumps there. */
  currentTime: number;
  /** Seconds; not a number until the file is known. */
  readonly duration: number;
  readonly paused: boolean;
  play(): Promise<void>;
  pause(): void;
  /** Types used: `timeupdate`, `play`, `pause`, `ended`, `loadedmetadata`, `durationchange`. */
  addEventListener(type: string, cb: () => void): void;
  removeEventListener(type: string, cb: () => void): void;
  /** Let go of the native player. */
  release?(): void;
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
  /** What `recordMedia` can record; absent = both. A platform that cannot record video leaves it out and the button is hidden. */
  recordKinds?: ReadonlyArray<"audio" | "video">;
  /** Make a player for an audio file at `url`. Absent = the browser's own `Audio` is used. */
  createAudio?(url: string): AudioClip;
  /** Absent = preferences live only for this run. */
  preferences?: PreferencesStore;
  /** Let the user choose files to send. Absent = the attach button is hidden. */
  pickFiles?(): Promise<AttachmentSource[]>;
  /**
   * Receive files dropped onto the window or pasted from the clipboard. `onHover(true)` while files
   * are dragged over the window. Returns the unsubscribe function. Absent = no drop/paste.
   */
  receiveFiles?(onFiles: (files: AttachmentSource[]) => void, onHover: (over: boolean) => void): () => void;
  /** Put text on the system clipboard. Absent = the app falls back to the browser's clipboard, if any. */
  copyText?(text: string): Promise<void>;
  /** Open a link outside the app (a browser tab). Absent = links are inert. */
  openLink?(url: string): void;
  /**
   * Save/open a resolved file URL (e.g. trigger a browser download). Resolves to "saved" when the file went into the
   * device's own library (the photo gallery), so the app can say so; a download or a share sheet shows itself.
   */
  saveFile?(file: { url: string; name: string }): Promise<"saved" | void>;
}

/** What the screens get of the platform: everything but the session store, which belongs to the controllers (one per account). */
export type AppServices = Omit<PlatformServices, "sessionStore">;
