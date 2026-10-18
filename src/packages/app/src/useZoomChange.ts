import { useCallback, useEffect, useRef, useState } from "react";
import { useController } from "./context.js";

/** How long a new zoom is tried before it goes back by itself. */
export const ZOOM_CONFIRM_SECONDS = 15;

/** Whole seconds left until `until` (a time in ms), counting a started second as left; 0 once it has passed. */
export function secondsLeft(until: number, now: number): number {
  return Math.max(0, Math.ceil((until - now) / 1000));
}

/**
 * Changing the zoom is tried before it is kept: it is applied at once, but not saved, and unless it is confirmed within
 * ZOOM_CONFIRM_SECONDS it goes back (a size that cannot be read cannot be confirmed either, so the way back must not need the
 * screen). Saving happens only on `keep`.
 */
export function useZoomChange() {
  const controller = useController();
  const [trial, setTrial] = useState<{ from: number; to: number; until: number } | null>(null);
  const [left, setLeft] = useState(0);
  const trialRef = useRef(trial);
  trialRef.current = trial;

  const revert = useCallback(() => {
    const t = trialRef.current;
    if (!t) return;
    trialRef.current = null;
    setTrial(null);
    controller.previewPreferences({ uiScale: t.from });
  }, [controller]);

  const keep = useCallback(() => {
    const t = trialRef.current;
    if (!t) return;
    trialRef.current = null;
    setTrial(null);
    controller.setPreferences({ uiScale: t.to });
  }, [controller]);

  /** Try `to`. A second change while one is being tried goes back to the size from before the first. */
  const start = useCallback(
    (to: number) => {
      const from = trialRef.current?.from ?? controller.store.getState().prefs.uiScale;
      if (to === from) {
        revert();
        return;
      }
      const until = Date.now() + ZOOM_CONFIRM_SECONDS * 1000;
      controller.previewPreferences({ uiScale: to });
      setTrial({ from, to, until });
      setLeft(ZOOM_CONFIRM_SECONDS);
    },
    [controller, revert],
  );

  useEffect(() => {
    if (!trial) return;
    const id = setInterval(() => {
      const n = secondsLeft(trial.until, Date.now());
      setLeft(n);
      if (n <= 0) revert();
    }, 250);
    return () => clearInterval(id);
  }, [trial, revert]);

  // Leaving the page with a trial open must not leave the new size applied without having been kept.
  useEffect(() => () => revert(), [revert]);

  return { trial, left, start, keep, revert };
}
