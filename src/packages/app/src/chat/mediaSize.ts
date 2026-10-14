/** The longest edge a picture or video is shown at inside a bubble. */
export const MAX_IMAGE = 300;

/** Scale to fit MAX_IMAGE on the long edge, keeping aspect; unknown size → square. Never smaller than 130×90. */
export function fit(w?: number, h?: number): { width: number; height: number } {
  if (!w || !h) return { width: MAX_IMAGE, height: MAX_IMAGE };
  const k = Math.min(1, MAX_IMAGE / Math.max(w, h));
  return { width: Math.max(130, Math.round(w * k)), height: Math.max(90, Math.round(h * k)) };
}
