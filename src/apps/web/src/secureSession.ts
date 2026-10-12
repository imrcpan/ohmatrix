import type { Session, SessionStore } from "@ohmatrix/core";
import type { SecureBox } from "./secureBox.js";

const LEGACY_KEY = "ohmatrix.session.v1"; // plaintext JSON, written by early versions
const KEY = "ohmatrix.session.v2"; // encrypted with the SecureBox

/** Session persistence that never writes the access token in the clear. */
export function createSecureSessionStore(box: SecureBox, storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = localStorage): SessionStore {
  const save = async (s: Session) => storage.setItem(KEY, await box.encrypt(JSON.stringify(s)));
  return {
    async load() {
      const sealed = storage.getItem(KEY);
      if (sealed) {
        try {
          return JSON.parse(await box.decrypt(sealed)) as Session;
        } catch {
          storage.removeItem(KEY);
          return null;
        }
      }
      const legacy = storage.getItem(LEGACY_KEY); // upgrade in place
      if (!legacy) return null;
      try {
        const s = JSON.parse(legacy) as Session;
        await save(s);
        storage.removeItem(LEGACY_KEY);
        return s;
      } catch {
        storage.removeItem(LEGACY_KEY);
        return null;
      }
    },
    save,
    async clear() {
      storage.removeItem(KEY);
      storage.removeItem(LEGACY_KEY);
    },
  };
}
