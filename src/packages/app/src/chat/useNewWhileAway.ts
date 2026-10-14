import { useEffect, useRef, useState } from "react";
import type { TimelineItem } from "@ohmatrix/core";

/**
 * Whether the view is far from the newest message, and how many messages from other people arrived while it was
 * up in the history (shown on the "scroll to latest" button).
 */
export function useNewWhileAway(items: TimelineItem[] | undefined) {
  const pinned = useRef(true);
  const lastSeen = useRef<string | undefined>(undefined);
  const [away, setAwayState] = useState(false);
  const [count, setCount] = useState(0);
  const lastId = items?.[items.length - 1]?.id;

  useEffect(() => {
    const last = items?.[items.length - 1];
    if (lastSeen.current !== undefined && last && last.id !== lastSeen.current && !last.isOwn && !pinned.current) setCount((n) => n + 1);
    lastSeen.current = last?.id;
    // Only a new last message counts, not any change to the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastId]);

  return {
    away,
    count,
    onPinnedChange: (p: boolean) => {
      pinned.current = p;
    },
    onAwayChange: (a: boolean) => {
      setAwayState(a);
      if (!a) setCount(0);
    },
    reset: () => {
      setCount(0);
      setAwayState(false);
    },
  };
}
