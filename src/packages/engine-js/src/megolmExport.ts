/**
 * The Matrix key export format (the one Element reads and writes): the room keys as JSON, encrypted with a passphrase.
 * PBKDF2-SHA512 gives 64 bytes: the first 32 are the AES-256-CTR key, the last 32 the HMAC-SHA256 key. The file is base64 of
 * version | salt | iv | rounds | ciphertext | mac, between the BEGIN and END lines. The iv's bit 63 is cleared, so the counter
 * (its low 64 bits) cannot wrap into the nonce.
 */

const BEGIN = "-----BEGIN MEGOLM SESSION DATA-----";
const END = "-----END MEGOLM SESSION DATA-----";
const VERSION = 1;
const SALT_BYTES = 16;
const IV_BYTES = 16;
const MAC_BYTES = 32;
const HEADER_BYTES = 1 + SALT_BYTES + IV_BYTES + 4;
/** The number of PBKDF2 rounds the format asks for (at least this many for a passphrase). */
export const EXPORT_ROUNDS = 500_000;

async function deriveKeys(passphrase: string, salt: Uint8Array<ArrayBuffer>, rounds: number) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-512", salt, iterations: rounds }, material, 512);
  const bytes = new Uint8Array(bits);
  const aes = await crypto.subtle.importKey("raw", bytes.slice(0, 32), { name: "AES-CTR" }, false, ["encrypt", "decrypt"]);
  const hmac = await crypto.subtle.importKey("raw", bytes.slice(32), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  return { aes, hmac };
}

function aesCtr(iv: Uint8Array<ArrayBuffer>, key: CryptoKey, data: Uint8Array<ArrayBuffer>, usage: "encrypt" | "decrypt") {
  const algorithm = { name: "AES-CTR", counter: iv, length: 64 };
  return usage === "encrypt" ? crypto.subtle.encrypt(algorithm, key, data) : crypto.subtle.decrypt(algorithm, key, data);
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function decodeBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

/** The export file for `json` (a JSON list of room keys), encrypted with `passphrase`. */
export async function encryptMegolmExport(json: string, passphrase: string, rounds = EXPORT_ROUNDS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  iv[8] = (iv[8] ?? 0) & 0x7f;
  const roundsBytes = new Uint8Array(4);
  new DataView(roundsBytes.buffer).setUint32(0, rounds);
  const { aes, hmac } = await deriveKeys(passphrase, salt, rounds);
  const ciphertext = new Uint8Array(await aesCtr(iv, aes, new TextEncoder().encode(json), "encrypt"));
  const body = new Uint8Array(HEADER_BYTES + ciphertext.length + MAC_BYTES);
  body[0] = VERSION;
  body.set(salt, 1);
  body.set(iv, 1 + SALT_BYTES);
  body.set(roundsBytes, 1 + SALT_BYTES + IV_BYTES);
  body.set(ciphertext, HEADER_BYTES);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", hmac, body.subarray(0, HEADER_BYTES + ciphertext.length)));
  body.set(mac, HEADER_BYTES + ciphertext.length);
  const lines = encodeBase64(body).match(/.{1,64}/g) ?? [];
  return [BEGIN, ...lines, END].join("\n");
}

/** The JSON inside an export file, or an error when the passphrase is wrong or the file is damaged. */
export async function decryptMegolmExport(file: string, passphrase: string): Promise<string> {
  const lines = file.trim().split(/\r?\n/);
  if (lines[0] !== BEGIN || lines[lines.length - 1] !== END) throw new Error("not a key export file");
  const body = decodeBase64(lines.slice(1, -1).join(""));
  if (body.length < HEADER_BYTES + MAC_BYTES || body[0] !== VERSION) throw new Error("not a key export file");
  const salt = body.slice(1, 1 + SALT_BYTES);
  const iv = body.slice(1 + SALT_BYTES, 1 + SALT_BYTES + IV_BYTES);
  const rounds = new DataView(body.buffer, body.byteOffset).getUint32(1 + SALT_BYTES + IV_BYTES);
  const signed = body.subarray(0, body.length - MAC_BYTES);
  const { aes, hmac } = await deriveKeys(passphrase, salt, rounds);
  const mac = body.slice(body.length - MAC_BYTES);
  if (!(await crypto.subtle.verify("HMAC", hmac, mac, signed))) throw new Error("wrong passphrase, or the file is damaged");
  const plain = await aesCtr(iv, aes, signed.slice(HEADER_BYTES), "decrypt");
  return new TextDecoder().decode(plain);
}
