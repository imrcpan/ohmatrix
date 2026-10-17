/** The extension a picture's own first bytes call for (png, jpg, gif, webp), or undefined when they are none of these. */
export function sniffImageExtension(head: Uint8Array): "png" | "jpg" | "gif" | "webp" | undefined {
  const is = (at: number, ...bytes: number[]) => bytes.every((b, i) => head[at + i] === b);
  if (is(0, 0x89, 0x50, 0x4e, 0x47)) return "png";
  if (is(0, 0xff, 0xd8, 0xff)) return "jpg";
  if (is(0, 0x47, 0x49, 0x46, 0x38)) return "gif";
  if (is(0, 0x52, 0x49, 0x46, 0x46) && is(8, 0x57, 0x45, 0x42, 0x50)) return "webp";
  return undefined;
}
