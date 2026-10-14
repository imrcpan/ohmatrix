/**
 * How to fetch a piece of media. Encrypted media comes with the keys to decrypt it and the type to give the result;
 * plain media needs neither.
 */
export function decryptOpts(c: object | undefined): { encryption?: unknown; mimeType?: string } {
  const m = c as { encryption?: unknown; mimeType?: string } | undefined;
  return m && m.encryption ? { encryption: m.encryption, ...(m.mimeType ? { mimeType: m.mimeType } : {}) } : {};
}
