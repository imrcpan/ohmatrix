export const MIN = 0.25;
export const MAX = 8;
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** The zoom after a pinch: it follows how far the two fingers have moved apart (or together) since they landed. */
export function pinchedScale(startScale: number, startDistance: number, distance: number) {
  if (!(startDistance > 0)) return startScale;
  return clamp((startScale * distance) / startDistance, MIN, MAX);
}
