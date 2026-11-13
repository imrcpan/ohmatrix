import type { AttachmentSource } from "@ohmatrix/core";
import { OPEN_EMOJI, OPEN_EMOJI_SIZE } from "./openEmoji.js";

/**
 * The id of the set the sticker panel always has first: Open Emoji Cute, which is part of the app. It is not stored in the account, it
 * cannot be changed or deleted, and it holds no sticker of mine (the emoji are sent as they are, see `openEmojiFile`).
 */
export const BUILTIN_GROUP = "open-emoji-cute";

export type OpenEmoji = (typeof OPEN_EMOJI)[number];

/** The cover of the set: the devil. */
export const BUILTIN_COVER: OpenEmoji = OPEN_EMOJI.find((e) => e.name === "devil")!;

/** The address of an emoji's picture, for an Image. */
export const openEmojiUri = (e: OpenEmoji): string => `data:image/png;base64,${e.png}`;

/** The bytes of a base64 text. */
export function decodeBase64(text: string): Uint8Array {
  const bin = (globalThis as unknown as { atob(s: string): string }).atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * An emoji as a file to send: a PNG (a sticker may not be SVG, and a phone cannot draw one). The platform wants its handle in `data`: a
 * Blob in a browser (`asBlob`), the bytes' buffer elsewhere.
 */
export function openEmojiFile(e: OpenEmoji, asBlob: boolean): AttachmentSource {
  const bytes = decodeBase64(e.png);
  const data: unknown = asBlob
    ? new (Blob as unknown as new (parts: unknown[], options: { type: string }) => Blob)([bytes], { type: "image/png" })
    : bytes.buffer;
  return { name: `${e.name}.png`, mimeType: "image/png", size: bytes.length, data, width: OPEN_EMOJI_SIZE, height: OPEN_EMOJI_SIZE };
}
