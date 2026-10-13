import { EventType, type MatrixClient, type Room } from "matrix-js-sdk";
import { isDirect } from "./convert.js";

/** Space children in display order: `order` is a string that sorts lexicographically, then by id. */
export function childRooms(client: MatrixClient, space: Room): { id: string; order: string; via: string[] }[] {
  void client;
  const out: { id: string; order: string; via: string[] }[] = [];
  for (const ev of space.currentState.getStateEvents(EventType.SpaceChild)) {
    const id = ev.getStateKey();
    if (!id) continue;
    const c = ev.getContent() as { order?: unknown; via?: unknown };
    // An empty content means "removed" (the same way a leave tombstone works).
    if (!c || Object.keys(c).length === 0) continue;
    out.push({
      id,
      order: typeof c.order === "string" ? c.order : "",
      via: Array.isArray(c.via) ? c.via.filter((v): v is string => typeof v === "string") : [],
    });
  }
  return out.sort((a, b) => a.order.localeCompare(b.order) || a.id.localeCompare(b.id));
}

/** A one-to-one chat: not something a space should list as a child. */
export const isDirectRoom = isDirect;
