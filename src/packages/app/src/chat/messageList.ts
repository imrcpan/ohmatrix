import type { MutableRefObject, ReactNode } from "react";
import type { Row } from "../timelineRows.js";

/**
 * The contract between a chat and its list of messages, the same on every platform. Native lists the rows upside down
 * (`MessageList.tsx`, where offset 0 is the newest message and nothing needs looking after); the web lists them in
 * reading order (`MessageList.web.tsx`) and keeps the view at the bottom, and where it is when older rows are added,
 * by hand. The chat does not know which it has.
 */
export interface MessageListProps {
  /** Always oldest first; a list that wants another order reverses it itself. */
  rows: Row[];
  /** The room's messages have been read (an empty room has none to wait for). */
  loaded: boolean;
  renderRow(row: Row): ReactNode;
  /** Near the oldest loaded row: ask for older history. */
  onReachedStart(): void;
  /** The list is placed on the newest message and has stopped moving: it may be shown. */
  onReady(): void;
  /** The view is at the bottom (so new messages are in view) or has left it. */
  onPinnedChange(pinned: boolean): void;
  /** The view is far from the newest message. */
  onAwayChange(away: boolean): void;
  /** The reader is scrolling (not a jump we made). */
  onMoving(): void;
  /** The row at the top of the view, for the floating date. */
  onVisibleTop(row: Row): void;
  /** Filled in by the list with what the chat can ask of it. */
  handleRef: MutableRefObject<MessageListHandle | null>;
}

export interface MessageListHandle {
  /** Go to the newest message, and follow new ones again. */
  scrollToLatest(): void;
  /** Bring a row (by its `key`) to the middle of the view, and stay on it while neighbours are measured. */
  scrollToRow(key: string): void;
}
