/** The longest edge a picture or video is shown at inside a bubble. */
export const MAX_IMAGE = 300;

/** Scale to fit MAX_IMAGE on the long edge, keeping aspect; unknown size → square. Never smaller than 130×90. */
export function fit(w?: number, h?: number): { width: number; height: number } {
  if (!w || !h) return { width: MAX_IMAGE, height: MAX_IMAGE };
  const k = Math.min(1, MAX_IMAGE / Math.max(w, h));
  return { width: Math.max(130, Math.round(w * k)), height: Math.max(90, Math.round(h * k)) };
}

/** The longest edge a sticker is shown at: bigger than an emoji, smaller than a photo. */
export const STICKER_EDGE = 170;

/** A sticker keeps its shape and is drawn to the same long edge, whatever its size (a small one is enlarged, a big one shrunk). */
export function fitSticker(w?: number, h?: number): { width: number; height: number } {
  if (!w || !h) return { width: STICKER_EDGE, height: STICKER_EDGE };
  const k = STICKER_EDGE / Math.max(w, h);
  return { width: Math.max(40, Math.round(w * k)), height: Math.max(40, Math.round(h * k)) };
}
