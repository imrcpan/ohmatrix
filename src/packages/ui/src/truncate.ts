/**
 * Longest prefix of `text` that, followed by three ASCII dots ("..."), fits in `maxWidth`.
 * `measure` returns the rendered width of a string. Text that already fits is returned unchanged.
 */
export function truncateWithDots(text: string, maxWidth: number, measure: (s: string) => number): string {
  if (maxWidth <= 0 || measure(text) <= maxWidth) return text;
  const chars = Array.from(text); // code points, so emoji are never split
  let lo = 0,
    hi = chars.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(chars.slice(0, mid).join("").trimEnd() + "...") <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return chars.slice(0, lo).join("").trimEnd() + "...";
}
