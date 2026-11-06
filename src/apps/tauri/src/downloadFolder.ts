import { open } from "@tauri-apps/plugin-dialog";
import type { PlatformServices } from "@ohmatrix/core";

const KEY = "ohmatrix.downloadFolder.v1";

/** The folder the person chose for saved files, or null for the system's Downloads folder. */
export function chosenFolder(): string | null {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Where saved files go. The system's folder chooser lets the folder into the file scope for this run (and the persisted-scope plugin for the
 * next ones); the choice itself is kept in this window's storage, as the other settings of the page are.
 */
export const downloadFolder: NonNullable<PlatformServices["downloadFolder"]> = {
  current: async () => chosenFolder(),
  async choose() {
    const picked = await open({ directory: true, multiple: false, ...(chosenFolder() ? { defaultPath: chosenFolder()! } : {}) });
    if (typeof picked !== "string") return null;
    localStorage.setItem(KEY, picked);
    return picked;
  },
  async reset() {
    localStorage.removeItem(KEY);
  },
};
