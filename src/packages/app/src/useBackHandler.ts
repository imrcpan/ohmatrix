import { useEffect } from "react";
import { BackHandler } from "react-native";
import { useLatest } from "./chat/useLatest.js";

/**
 * Takes the platform's back (the Android back button or gesture) while `handler` is set. It returns whether it handled
 * the press: when it did not, the next one goes on, and in the end the system leaves the app. A handler added later is
 * asked first, so what is opened on top of something else gets the press before it. The web has its own back (the
 * browser's history), see useBackHandler.web.ts.
 */
export function useBackHandler(handler: (() => boolean) | null): void {
  const latest = useLatest(handler);
  const active = handler !== null;
  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => latest.current?.() ?? false);
    return () => subscription.remove();
  }, [active, latest]);
}
