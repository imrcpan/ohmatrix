import type { MediaKind, MessageContent } from "@ohmatrix/core";

/** Which gallery tab a message belongs to; null for everything that is not shared media (text, service lines...). */
export function mediaKindOf(c: MessageContent): MediaKind | null {
  return c.kind === "image" || c.kind === "video" || c.kind === "audio" || c.kind === "file" ? c.kind : null;
}
