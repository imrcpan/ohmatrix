import type { AccountStore, SessionStore } from "@ohmatrix/core";
import { OLD_DB_PASSPHRASE_KEY, STORE_FORMAT, STORE_FORMAT_KEY, type SecureKeyValue } from "./secureStorage.js";

/**
 * The databases of this version are opened with a key; the ones of earlier versions were opened with a passphrase, and cannot be opened
 * with a key. So the first start of this version drops the accounts of the old kind (the person signs in again) and the old
 * databases, and notes the kind of database it makes. Done once: later starts find the note and do nothing. Returns whether it did.
 */
export async function retireOldStores(d: {
  kv: SecureKeyValue;
  accounts: AccountStore;
  legacySessions: SessionStore;
  /** Delete the old databases and the folders of the old accounts. */
  deleteFiles(): void | Promise<void>;
}): Promise<boolean> {
  if ((await d.kv.getItemAsync(STORE_FORMAT_KEY).catch(() => null)) === STORE_FORMAT) return false;
  for (const a of await d.accounts.list()) await d.accounts.remove(a.session.userId);
  await d.legacySessions.clear();
  await d.deleteFiles();
  await d.kv.deleteItemAsync(OLD_DB_PASSPHRASE_KEY).catch(() => {});
  await d.kv.setItemAsync(STORE_FORMAT_KEY, STORE_FORMAT);
  return true;
}
