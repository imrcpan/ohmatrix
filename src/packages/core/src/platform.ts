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
  /** Where the permission is asked and changed: in a browser (per site) or in the system's settings (an installed app). Words the hints. */
  readonly kind: "browser" | "system";
  permission(): NotificationPermission;
  /** Ask the OS/browser for permission; must be called from a user gesture on the web. */
  request(): Promise<NotificationPermission>;
  /** True while the app window is visible and focused, i.e. the user is already looking at it. */
  isActive(): boolean;
  /** Same `tag` replaces an earlier notification (one per chat). `onClick` should bring the app to the front. */
  show(n: { title: string; body: string; tag: string; onClick: () => void }): void;
}

/** The sounds of a call: the ring of an incoming one, the tone of an outgoing one. Absent = a call is silent until it is answered. */
export interface CallSounds {
  /** Start a sound that repeats until `stop` is called on what this returns. */
  play(kind: "incoming" | "outgoing"): () => void;
  /** A short sound when a call ends. */
  ended(): void;
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
  /** The version of this build, shown in Settings. The shell sets it from the build; absent in development. */
  appVersion?: string;
  notifications?: SystemNotifications;
  /**
   * Push through a gateway, so a message arrives with the app closed (Android: FCM). Absent = no push (the web, a build without the
   * Firebase file). `token` is the device's push token; it rejects when there is none to get.
   */
  push?: {
    /** The application id the gateway knows. */
    appId: string;
    /** The gateway's notify URL. */
    gatewayUrl: string;
    deviceName: string;
    token(): Promise<string>;
    /** Calls `cb` with the new token when the push service changes it; returns an unsubscribe. */
    onToken(cb: (token: string) => void): () => void;
  };
  /** Record a voice message or a short video. Absent = the record buttons are hidden. Rejects with RecordError. */
  recordMedia?(kind: "audio" | "video"): Promise<Recorder>;
  /** What `recordMedia` can record; absent = both. A platform that cannot record video leaves it out and the button is hidden. */
  recordKinds?: ReadonlyArray<"audio" | "video">;
  /** Make a player for an audio file at `url`. Absent = the browser's own `Audio` is used. */
  createAudio?(url: string): AudioClip;
  /** Absent = a call makes no sound of its own. */
  callSounds?: CallSounds;
  /** Absent = preferences live only for this run. */
  preferences?: PreferencesStore;
  /** Let the user choose files to send. Absent = the attach button is hidden. */
  pickFiles?(): Promise<AttachmentSource[]>;
  /** Let the user choose one picture, from the system's photo picker (a profile or room picture). Absent = `pickFiles` is used. Null = nothing chosen. */
  pickPhoto?(): Promise<AttachmentSource | null>;
  /** Like `pickPhoto`, but several pictures at once (stickers). Absent = `pickFiles` is used. Empty = nothing chosen. */
  pickPhotos?(): Promise<AttachmentSource[]>;
  /**
   * Receive files dropped onto the window or pasted from the clipboard. `onHover(true)` while files
   * are dragged over the window. Returns the unsubscribe function. Absent = no drop/paste.
   */
  receiveFiles?(onFiles: (files: AttachmentSource[]) => void, onHover: (over: boolean) => void): () => void;
  /** Put text on the system clipboard. Absent = the app falls back to the browser's clipboard, if any. */
  copyText?(text: string): Promise<void>;
  /** The names of the fonts installed on this device, for choosing the interface's font. Absent = the font cannot be chosen here. */
  listFonts?(): Promise<string[]>;
  /**
   * Icons the app can show on the device's home screen, to choose from in Settings. `preview` is a picture for the list (what the app has,
   * for a React Native `Image`, as `require()` gives it); `set` changes the home-screen icon. Absent = there is nothing to choose.
   */
  appIcons?: {
    list(): { id: string; preview: number }[];
    current(): string;
    set(id: string): void;
  };
  /**
   * The app's logo as SVG markup, as it is now (on a phone: the icon chosen in Settings; on the web: the page's icon), for the sign-in
   * screen. It is the plain logo (the rounded shape), not the full-square one made for a launcher. Absent = the screen draws a mark of its own.
   */
  appLogo?(): string;
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
