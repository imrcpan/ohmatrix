import { EngineError } from "@ohmatrix/core";
import type { Account, Fetch } from "./devices.js";

/** The ids in the content of an `m.room.pinned_events` event: `pinned`, as the spec and the other clients write it. */
export function pinnedOf(content: unknown): string[] {
  const list = (content as { pinned?: unknown } | null | undefined)?.pinned;
  return Array.isArray(list) ? list.filter((e): e is string => typeof e === "string") : [];
}

/**
 * The room's pinned messages as the server has them now, in one request. The chat list does not carry them (the SDK only brings them for
 * a room it follows, after another round trip to the server), so the first look asks for them directly. A room with none is an empty list.
 */
export async function readPinned(f: Fetch, a: Account, roomId: string): Promise<string[]> {
  const url = `${a.homeserverUrl.replace(/\/+$/, "")}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.pinned_events/`;
  let res;
  try {
    res = await f(url, { method: "GET", headers: { Authorization: `Bearer ${a.accessToken}` } });
  } catch (e) {
    throw new EngineError("network", e instanceof Error ? e.message : "could not reach the server");
  }
  if (res.status === 404) return [];
  if (!res.ok) throw new EngineError("unknown", `could not read the pinned messages (${res.status})`);
  return pinnedOf(await res.json().catch(() => undefined));
}
