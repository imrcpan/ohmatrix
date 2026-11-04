import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useServices } from "./context.js";
import { shareInbox } from "./shareInbox.js";

/**
 * Takes what other apps share to this one, into the inbox: when the app is started by the share, when it is already running, and whenever it comes
 * to the front (a share can have come while it was away). Returns whether the first look has been made: until then it is not known whether the app was
 * started by a share, and the screen that is first must not be chosen.
 */
export function useIncomingShare(): boolean {
  const services = useServices();
  const [looked, setLooked] = useState(!services.incomingShare);
  useEffect(() => {
    const incoming = services.incomingShare;
    if (!incoming) return;
    let live = true;
    const take = () =>
      void incoming.take().then(
        (c) => {
          if (!live) return;
          if (c && (c.files.length > 0 || c.text)) shareInbox.offer(c);
          setLooked(true);
        },
        () => live && setLooked(true),
      );
    take();
    const off = incoming.onShare(take);
    const app = AppState.addEventListener("change", (state) => state === "active" && take());
    return () => {
      live = false;
      off();
      app.remove();
    };
  }, [services]);
  return looked;
}
