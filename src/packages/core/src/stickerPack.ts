import { EngineError } from "./errors.js";
import { STICKER_MAX_BYTES, type Sticker } from "./types.js";

/** The account data event my own pack lives in (MSC2545, as Element and Cinny write it). */
export const STICKER_PACK_EVENT = "im.ponies.user_emotes";

interface PackImage {
  url?: unknown;
  body?: unknown;
  info?: { mimetype?: unknown; w?: unknown; h?: unknown; size?: unknown };
  usage?: unknown;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** The stickers of a pack's content, in the order the pack has them. Images the pack marks as emoticon-only are left out. */
export function parsePack(content: unknown): Sticker[] {
  const images = (content as { images?: Record<string, PackImage> } | null | undefined)?.images;
  if (!images || typeof images !== "object") return [];
  const out: Sticker[] = [];
  for (const [shortcode, im] of Object.entries(images)) {
    if (typeof im?.url !== "string" || !im.url.startsWith("mxc://")) continue;
    if (Array.isArray(im.usage) && !im.usage.includes("sticker")) continue;
    const info = im.info ?? {};
    const width = num(info.w);
    const height = num(info.h);
    const size = num(info.size);
    out.push({
      shortcode,
      url: im.url,
      mimeType: typeof info.mimetype === "string" ? info.mimetype : "image/png",
      ...(width !== undefined && { width }),
      ...(height !== undefined && { height }),
      ...(size !== undefined && { size }),
    });
  }
  return out;
}

/**
 * The pack's content with `stickers` as its images. The rest of what was there (the pack's name and picture, and the images that are only
 * emoticons) is kept as it was, so another client's data is not lost.
 */
export function writePack(previous: unknown, stickers: readonly Sticker[]): Record<string, unknown> {
  const old = (previous && typeof previous === "object" ? previous : {}) as { images?: Record<string, PackImage> } & Record<string, unknown>;
  const kept: Record<string, PackImage> = {};
  for (const [code, im] of Object.entries(old.images ?? {})) {
    if (Array.isArray(im?.usage) && !im.usage.includes("sticker")) kept[code] = im;
  }
  const images: Record<string, unknown> = { ...kept };
  for (const s of stickers) {
    images[s.shortcode] = {
      url: s.url,
      body: s.shortcode,
      info: {
        mimetype: s.mimeType,
        ...(s.width !== undefined && { w: s.width }),
        ...(s.height !== undefined && { h: s.height }),
        ...(s.size !== undefined && { size: s.size }),
      },
      usage: ["sticker"],
    };
  }
  return { ...old, images };
}

/** The content of the `m.sticker` event that sends `s`. */
export function stickerEventContent(s: Sticker): Record<string, unknown> {
  return {
    body: s.shortcode,
    url: s.url,
    info: {
      mimetype: s.mimeType,
      ...(s.width !== undefined && { w: s.width }),
      ...(s.height !== undefined && { h: s.height }),
      ...(s.size !== undefined && { size: s.size }),
    },
  };
}

/** A name for a new sticker from a file name or caption: no extension, no surrounding blanks, and not one the pack already has. */
export function newShortcode(name: string | undefined, taken: ReadonlySet<string>): string {
  const base =
    (name ?? "")
      .replace(/\.[A-Za-z0-9]{1,5}$/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40) || "sticker";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

const KINDS: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
const MIMES = new Set(Object.values(KINDS));

/**
 * The type of a file for the pack, or a refusal: only PNG, JPEG, GIF and WebP are taken (what every client draws, and what an animation
 * can be), whatever else it is: SVG, video, a document. A file whose type the system did not give is told by its name's ending.
 */
export function stickerMime(file: { name?: string | undefined; mimeType: string }): string {
  const given = file.mimeType.toLowerCase().replace("image/jpg", "image/jpeg");
  const byName = KINDS[(file.name ?? "").split(".").pop()?.toLowerCase() ?? ""];
  const mime = MIMES.has(given) ? given : !given || given === "application/octet-stream" ? byName : undefined;
  if (!mime) throw new EngineError("unsupported_type", "A sticker has to be a PNG, JPEG, GIF or WebP picture");
  return mime;
}

/** Refuse a file the pack may not hold: of a kind it does not take, or heavier than STICKER_MAX_BYTES. Gives the file's type. */
export function checkSticker(file: { name?: string | undefined; mimeType: string; size: number }): string {
  const mime = stickerMime(file);
  if (file.size > STICKER_MAX_BYTES) throw new EngineError("too_large", "The picture is over the 3 MB a sticker may be");
  return mime;
}
