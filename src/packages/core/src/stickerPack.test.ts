import { describe, expect, it } from "vitest";
import { EngineError } from "./errors.js";
import { checkSticker, newShortcode, parsePack, stickerEventContent, writePack } from "./stickerPack.js";
import { STICKER_MAX_BYTES } from "./types.js";

const s = { shortcode: "cat", url: "mxc://h/a", mimeType: "image/gif", width: 10, height: 20, size: 5 };

describe("sticker pack", () => {
  it("reads the images of a pack, skipping what is not a sticker", () => {
    const pack = {
      images: {
        cat: { url: "mxc://h/a", info: { mimetype: "image/gif", w: 10, h: 20, size: 5 } },
        smile: { url: "mxc://h/b", usage: ["emoticon"] },
        bad: { url: "https://x/y" },
      },
    };
    expect(parsePack(pack)).toEqual([s]);
    expect(parsePack(undefined)).toEqual([]);
  });

  it("writes the stickers and keeps the rest of the pack", () => {
    const old = { pack: { display_name: "Mine" }, images: { smile: { url: "mxc://h/b", usage: ["emoticon"] }, gone: { url: "mxc://h/c" } } };
    const out = writePack(old, [s]) as { pack: unknown; images: Record<string, { usage: string[] }> };
    expect(out.pack).toEqual({ display_name: "Mine" });
    expect(Object.keys(out.images).sort()).toEqual(["cat", "smile"]);
    expect(parsePack(out)).toEqual([s]);
  });

  it("makes the content of the sticker event", () => {
    expect(stickerEventContent(s)).toEqual({ body: "cat", url: "mxc://h/a", info: { mimetype: "image/gif", w: 10, h: 20, size: 5 } });
  });

  it("names a new sticker, avoiding the names taken", () => {
    expect(newShortcode("My Cat.gif", new Set())).toBe("My Cat");
    expect(newShortcode("cat.png", new Set(["cat", "cat 2"]))).toBe("cat 3");
    expect(newShortcode(undefined, new Set())).toBe("sticker");
  });

  it("takes PNG, JPEG, GIF and WebP up to 3 MB, and gives the type", () => {
    expect(checkSticker({ mimeType: "image/png", size: STICKER_MAX_BYTES })).toBe("image/png");
    expect(checkSticker({ mimeType: "IMAGE/JPG", size: 1 })).toBe("image/jpeg");
    expect(checkSticker({ name: "a.GIF", mimeType: "", size: 1 })).toBe("image/gif");
    expect(checkSticker({ name: "a.webp", mimeType: "application/octet-stream", size: 1 })).toBe("image/webp");
  });

  it("refuses a kind it does not take, and what is over 3 MB", () => {
    expect(() => checkSticker({ mimeType: "image/png", size: STICKER_MAX_BYTES + 1 })).toThrow(expect.objectContaining({ code: "too_large" }));
    for (const f of [
      { mimeType: "video/mp4", size: 1 },
      { mimeType: "image/svg+xml", size: 1 },
      { mimeType: "text/plain", name: "a.png", size: 1 },
      { name: "a.txt", mimeType: "", size: 1 },
      { mimeType: "", size: 1 },
    ])
      expect(() => checkSticker(f)).toThrow(expect.objectContaining({ code: "unsupported_type" }));
    expect(() => checkSticker({ mimeType: "image/png", size: 1 })).not.toThrow(EngineError);
  });
});
