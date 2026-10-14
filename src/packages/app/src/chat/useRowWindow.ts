import { useCallback, useEffect, useRef, useState } from "react";
import { useWindowDimensions } from "react-native";
import type { Row } from "../timelineRows.js";
import { earlierStart, initialStart } from "./rowWindow.js";
import { useLatest } from "./useLatest.js";

/** How long to wait between older chunks once the chat is showing. */
const CHUNK_MS = 120;

/**
 * Hands the list only the newest part of what is loaded (about a screen and a half, by a guess at the row heights),
 * so the chat can be drawn and shown at once, then adds the older rows in chunks once it is `ready`. Older rows are
 * only ever added above the first one, which the lists already keep still. The window is anchored on a row, not on a
 * count, so new messages at the end and older history read from the server leave it where it is.
 */
export function useRowWindow(rows: Row[], ready: boolean) {
  const { width, height } = useWindowDimensions();
  const view = useRef({ width, height });
  view.current = { width, height };
  const all = useLatest(rows);
  const [anchor, setAnchor] = useState<string | null>(null);

  let from = anchor === null ? -1 : rows.findIndex((r) => r.key === anchor);
  if (from < 0 && rows.length > 0) {
    from = initialStart(rows, height, width);
    if (anchor === null) {
      // First rows of this chat: remember where the window starts. (Setting state during render is how a value
      // derived from props is kept; it re-renders at once, before anything is drawn.)
      setAnchor(rows[from]!.key);
    }
  }
  const start = Math.max(0, from);
  const shown = start === 0 ? rows : rows.slice(start);

  const startRef = useLatest(start);
  /** Draw `count` more screens of older rows (or up to row `key`). Returns whether anything was added. */
  const grow = useCallback(
    (upTo?: string): boolean => {
      const list = all.current;
      const at = startRef.current;
      if (at <= 0) return false;
      const target = upTo !== undefined ? list.findIndex((r) => r.key === upTo) : earlierStart(list, at, view.current.height, view.current.width);
      const next = target < 0 ? earlierStart(list, at, view.current.height, view.current.width) : Math.min(target, at);
      if (next === at) return false;
      setAnchor(list[next]!.key);
      return true;
    },
    [all, startRef],
  );

  // The rest follows, a chunk at a time, once the chat is on screen.
  const hidden = start > 0;
  useEffect(() => {
    if (!ready || !hidden) return;
    const timer = setTimeout(() => grow(), CHUNK_MS);
    return () => clearTimeout(timer);
  }, [ready, hidden, start, grow]);

  return { rows: shown, hidden, grow };
}
