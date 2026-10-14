import type { TimelineItem } from "@ohmatrix/core";

/** What the message menu offers for a quick reaction. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

/** What a row can ask the chat to do; the chat decides how. */
export interface RowActions {
  react(eventId: string, key: string): void;
  pin(item: TimelineItem, pinned: boolean): void;
  forward(item: TimelineItem): void;
  reply(item: TimelineItem): void;
  edit(item: TimelineItem): void;
  remove(eventId: string): void;
  /** Scroll to a message, loading older history first if it is not loaded (a reply's quote). */
  jump(eventId: string): void;
  cancelUpload(id: string): void;
  download(file: { url: string; name: string; encryption?: unknown; mimeType?: string }): void;
}
