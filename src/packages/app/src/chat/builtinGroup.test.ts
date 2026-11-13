import { expect, test } from "vitest";
import { checkSticker } from "@ohmatrix/core";
import { BUILTIN_COVER, BUILTIN_GROUP, decodeBase64, openEmojiFile, openEmojiUri } from "./builtinGroup.js";
import { OPEN_EMOJI, OPEN_EMOJI_SIZE } from "./openEmoji.js";

test("the set is Open Emoji Cute: 29 emoji with their names from the repository, the smiling face first and its cover", () => {
  expect(OPEN_EMOJI).toHaveLength(29);
  expect(new Set(OPEN_EMOJI.map((e) => e.name)).size).toBe(29);
  expect(OPEN_EMOJI[0]!.name).toBe("smile");
  expect(BUILTIN_COVER).toBe(OPEN_EMOJI[0]);
  expect(OPEN_EMOJI.at(-1)!.name).toBe("awkward-laugh");
  expect(BUILTIN_GROUP).toBe("open-emoji-cute");
});

test("every emoji is a PNG of the size the set says, small enough to be a sticker", () => {
  for (const e of OPEN_EMOJI) {
    const bytes = decodeBase64(e.png);
    // The PNG signature, and the width and height of its first chunk.
    expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(bytes.buffer);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([OPEN_EMOJI_SIZE, OPEN_EMOJI_SIZE]);
    expect(() => checkSticker({ name: `${e.name}.png`, mimeType: "image/png", size: bytes.length })).not.toThrow();
  }
});

test("an emoji is sent as a PNG file with its size, its data being the bytes' buffer (or a Blob in a browser)", () => {
  const smile = OPEN_EMOJI[0]!;
  const f = openEmojiFile(smile, false);
  expect(f).toMatchObject({ name: "smile.png", mimeType: "image/png", width: OPEN_EMOJI_SIZE, height: OPEN_EMOJI_SIZE });
  expect(f.data).toBeInstanceOf(ArrayBuffer);
  expect((f.data as ArrayBuffer).byteLength).toBe(f.size);
  const b = openEmojiFile(smile, true);
  expect(b.data).toBeInstanceOf(Blob);
  expect((b.data as Blob).size).toBe(b.size);
  expect(openEmojiUri(smile).startsWith("data:image/png;base64,")).toBe(true);
});
