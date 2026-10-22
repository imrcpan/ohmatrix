import { useEffect, useState } from "react";
import type { TimelineItem } from "@ohmatrix/core";
import { useAppState, useController } from "../context.js";

/** The pinned messages by id: from the chat when it has them loaded, and the others asked for (once each), so a pin from long ago still shows. */
export function usePinned(roomId: string, ids: readonly string[]): Record<string, TimelineItem | undefined> {
  const controller = useController();
  const loaded = useAppState((s) => s.timelines[roomId]);
  const [fetched, setFetched] = useState<Record<string, TimelineItem>>({});
  const missing = ids.filter((id) => !loaded?.some((m) => m.id === id) && !fetched[id]);
  const key = missing.join("\n");

  useEffect(() => {
    if (!key) return;
    let live = true;
    void controller.fetchMessages(roomId, key.split("\n")).then(
      (found) => live && setFetched((f) => ({ ...f, ...Object.fromEntries(found.map((m) => [m.id, m])) })),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [controller, roomId, key]);

  const out: Record<string, TimelineItem | undefined> = {};
  for (const id of ids) out[id] = loaded?.find((m) => m.id === id) ?? fetched[id];
  return out;
}

/** The ids of the messages pinned in the room, the newest last; none until the room has said. Following them lasts as long as the chat. */
export function usePinnedIds(roomId: string): readonly string[] {
  const controller = useController();
  const [ids, setIds] = useState<readonly string[]>([]);
  useEffect(() => {
    setIds([]);
    return controller.subscribePins(roomId, setIds);
  }, [controller, roomId]);
  return ids;
}
