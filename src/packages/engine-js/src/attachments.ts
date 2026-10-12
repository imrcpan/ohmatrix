/** Matrix encrypted attachments (spec "Sending encrypted attachments", v2): AES-256-CTR + SHA-256 over the ciphertext. */

export interface EncryptedFile {
  v: "v2";
  key: { kty: "oct"; key_ops: string[]; alg: "A256CTR"; k: string; ext: true };
  iv: string;
  hashes: { sha256: string };
}

const b64 = (b: ArrayBuffer | Uint8Array) => {
  let s = "";
  for (const x of b instanceof Uint8Array ? b : new Uint8Array(b)) s += String.fromCharCode(x);
  return btoa(s).replace(/=+$/, "");
};
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const b64url = (b: ArrayBuffer) => b64(b).replace(/\+/g, "-").replace(/\//g, "_");

export async function encryptAttachment(plain: ArrayBuffer): Promise<{ data: ArrayBuffer; info: EncryptedFile }> {
  const subtle = globalThis.crypto.subtle;
  const iv = new Uint8Array(16);
  globalThis.crypto.getRandomValues(iv.subarray(0, 8)); // low 8 bytes stay zero: the CTR counter
  const key = await subtle.generateKey({ name: "AES-CTR", length: 256 }, true, ["encrypt", "decrypt"]);
  const data = await subtle.encrypt({ name: "AES-CTR", counter: iv, length: 64 }, key, plain);
  const k = b64url(await subtle.exportKey("raw", key));
  return {
    data,
    info: {
      v: "v2",
      key: { kty: "oct", key_ops: ["encrypt", "decrypt"], alg: "A256CTR", k, ext: true },
      iv: b64(iv),
      hashes: { sha256: b64(await subtle.digest("SHA-256", data)) },
    },
  };
}

export async function decryptAttachment(cipher: ArrayBuffer, info: EncryptedFile): Promise<ArrayBuffer> {
  const subtle = globalThis.crypto.subtle;
  if (b64(await subtle.digest("SHA-256", cipher)) !== info.hashes.sha256.replace(/=+$/, "")) throw new Error("attachment hash mismatch");
  const key = await subtle.importKey("raw", unb64(info.key.k), { name: "AES-CTR" }, false, ["decrypt"]);
  return subtle.decrypt({ name: "AES-CTR", counter: unb64(info.iv), length: 64 }, key, cipher);
}
