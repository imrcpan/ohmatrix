import { contentText, type TimelineItem } from "@ohmatrix/core";
import type { Translate } from "./types.js";

/** A pinned message in a line or two: who said it, and what (a picture is just "Photo"). */
export function pinnedPreview(item: TimelineItem, t: Translate): string {
  const body = item.content.kind === "image" ? t("photo") : contentText(item.content).replace(/\s+/g, " ").trim().slice(0, 200);
  return `${item.senderName ? `${item.senderName}: ` : ""}${body}`;
}
