import { useCallback, useEffect, useRef, useState } from "react";
import { useAppState, useController } from "./context.js";

/** The sizes the interface can be drawn at (1 = 100%). */
export const SCALES = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

/** Whole seconds left until `until` (a time in ms), counting a started second as left; 0 once it has passed. */
export function secondsLeft(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / 1000));
}

/** How long after the menu is pressed the trial starts: the menu is a window of its own, and one opened while it is still going is sometimes not shown (Android). */
export const START_AFTER_MENU_MS = 80;

/**
 * Changing the zoom is tried before it is kept: the interface is drawn at the new size and a dialog asks to keep it, and unless it is
 * confirmed in time the size goes back. All of that is in the controller (`tryZoom`, `keepZoom`, `revertZoom`), not here: drawing at another
 * size rebuilds the screens, this page with them, and anything held in it would be lost at the moment it was needed. What this keeps is
 * the count of seconds shown, and the short wait that lets the menu close first.
 */
export function useZoomChange() {
  const controller = useController();
  const trial = useAppState((s) => s.zoomTrial);
  const [left, setLeft] = useState(0);
  const waiting = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(
    (to: number) => {
      if (waiting.current) clearTimeout(waiting.current);
      waiting.current = setTimeout(() => {
        waiting.current = null;
        controller.tryZoom(to);
      }, START_AFTER_MENU_MS);
    },
    [controller],
  );

  useEffect(() => {
    if (!trial) return;
    setLeft(secondsLeft(trial.until, Date.now()));
    const id = setInterval(() => setLeft(secondsLeft(trial.until, Date.now())), 250);
    return () => clearInterval(id);
  }, [trial]);

  useEffect(
    () => () => {
      if (waiting.current) clearTimeout(waiting.current);
    },
    [],
  );

  return { trial, left, start, keep: controller.keepZoom, revert: controller.revertZoom };
}
