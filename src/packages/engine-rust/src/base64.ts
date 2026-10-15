const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Bytes as base64 (not every JS runtime has `btoa`). */
export function toBase64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    out += ALPHABET[a >> 2]! + ALPHABET[((a & 3) << 4) | (b >> 4)]!;
    out += i + 1 < bytes.length ? ALPHABET[((b & 15) << 2) | (c >> 6)]! : "=";
    out += i + 2 < bytes.length ? ALPHABET[c & 63]! : "=";
  }
  return out;
}
