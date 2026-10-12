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
  /** Absent = preferences live only for this run. */
  preferences?: PreferencesStore;
  /** Let the user choose files to send. Absent = the attach button is hidden. */
  pickFiles?(): Promise<AttachmentSource[]>;
  /** Save/open a resolved file URL (e.g. trigger a browser download). */
  saveFile?(file: { url: string; name: string }): Promise<void>;
}
