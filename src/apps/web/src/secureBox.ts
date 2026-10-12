/**
 * Encrypts small secrets (the session, key material) before they touch localStorage.
 * An AES-GCM key is generated once with WebCrypto as *non-extractable* and kept in IndexedDB, so the key
 * itself can never be read out as bytes: copying localStorage or an IndexedDB dump elsewhere yields
 * nothing usable. (Script running inside the page can still ask the browser to decrypt; that is
 * inherent to any web client.)
 */
export interface SecureBox {
  encrypt(plain: string): Promise<string>;
  /** Throws if the data was not produced by this box or was modified. */
  decrypt(sealed: string): Promise<string>;
}

const STORE = "keys";

function open(idb: IDBFactory, dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const request = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function createSecureBox(opts: { idb?: IDBFactory; crypto?: Crypto; dbName?: string } = {}): SecureBox {
  const idb = opts.idb ?? indexedDB;
  const subtle = (opts.crypto ?? globalThis.crypto).subtle;
  const rnd = opts.crypto ?? globalThis.crypto;
  const dbName = opts.dbName ?? "ohmatrix-secure";
  let keyPromise: Promise<CryptoKey> | null = null;

  const masterKey = () =>
    (keyPromise ??= (async () => {
      const db = await open(idb, dbName);
      try {
        const existing = await request<CryptoKey | undefined>(db.transaction(STORE).objectStore(STORE).get("master"));
        if (existing) return existing;
        const key = await subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
        await request(db.transaction(STORE, "readwrite").objectStore(STORE).put(key, "master"));
        return key;
      } finally {
        db.close();
      }
    })());

  return {
    async encrypt(plain) {
      const iv = rnd.getRandomValues(new Uint8Array(12));
      const data = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, await masterKey(), new TextEncoder().encode(plain)));
      const out = new Uint8Array(iv.length + data.length);
      out.set(iv);
      out.set(data, iv.length);
      return toB64(out);
    },
    async decrypt(sealed) {
      const raw = fromB64(sealed);
      const plain = await subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, await masterKey(), raw.slice(12));
      return new TextDecoder().decode(plain);
    },
  };
}
