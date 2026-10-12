import type { AttachmentSource, Preferences, Session } from "./types.js";

/** Persists the session in platform secure storage (Keychain/Keystore/safeStorage/encrypted IndexedDB). */
export interface SessionStore {
  load(): Promise<Session | null>;
  save(session: Session): Promise<void>;
  clear(): Promise<void>;
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
  /** Absent = preferences live only for this run. */
  preferences?: PreferencesStore;
  /** Let the user choose files to send. Absent = the attach button is hidden. */
  pickFiles?(): Promise<AttachmentSource[]>;
  /** Save/open a resolved file URL (e.g. trigger a browser download). */
  saveFile?(file: { url: string; name: string }): Promise<void>;
}
