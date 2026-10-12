import type { StorageKeyProvider } from "@ohmatrix/engine-js";
import type { SecureBox } from "./secureBox.js";

const PREFIX = "ohmatrix.cryptokey.v1.";

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/**
 * Per-store keys for the encrypted IndexedDB crypto store. Each 32-byte key is random, and is kept
 * sealed by the SecureBox, so the crypto database and its key never sit next to each other in the clear.
 */
export function createCryptoKeyProvider(box: SecureBox, storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> = localStorage): StorageKeyProvider {
  return {
    async get(storeId) {
      const sealed = storage.getItem(PREFIX + storeId);
      if (sealed) {
        try {
          return fromB64(await box.decrypt(sealed)) as Uint8Array<ArrayBuffer>;
        } catch {
          storage.removeItem(PREFIX + storeId);
        }
      }
      const key = crypto.getRandomValues(new Uint8Array(32));
      storage.setItem(PREFIX + storeId, await box.encrypt(toB64(key)));
      return key;
    },
    async remove(storeId) {
      storage.removeItem(PREFIX + storeId);
    },
  };
}
