import { EngineError, type SpaceChild } from "@ohmatrix/core";
import type { Account, Fetch } from "./devices.js";

/** A room a space lists, with what the server says of it. */
export interface ListedChild {
  roomId: string;
  via: string[];
  order: string | undefined;
  name?: string | undefined;
  avatar?: string | undefined;
  isSpace: boolean;
}

const root = (a: Account) => a.homeserverUrl.replace(/\/+$/, "");
const headers = (a: Account) => ({ Authorization: `Bearer ${a.accessToken}`, "Content-Type": "application/json" });

async function send(f: Fetch, url: string, a: Account, method: string, body?: unknown) {
  try {
    return await f(url, { method, headers: headers(a), ...(body !== undefined && { body: JSON.stringify(body) }) });
  } catch (e) {
    throw new EngineError("network", e instanceof Error ? e.message : "could not reach the server");
  }
}

/** The rooms a space lists, in the order it gives them (the server's view, which names rooms I have not joined). */
export async function readChildren(f: Fetch, a: Account, spaceId: string): Promise<ListedChild[]> {
  const res = await send(f, `${root(a)}/_matrix/client/v1/rooms/${encodeURIComponent(spaceId)}/hierarchy?limit=100&max_depth=1`, a, "GET");
  if (!res.ok) throw new EngineError(res.status === 404 || res.status === 403 ? "not_found" : "unknown", `could not read the space (${res.status})`);
  const body = (await res.json()) as {
    rooms?: {
      room_id: string;
      name?: string;
      avatar_url?: string;
      room_type?: string;
      children_state?: { state_key: string; content: { order?: string; via?: string[] } }[];
    }[];
  };
  const rooms = body.rooms ?? [];
  const info = new Map(rooms.map((r) => [r.room_id, r]));
  const space = info.get(spaceId);
  const kids = (space?.children_state ?? []).filter((c) => Array.isArray(c.content.via) && c.content.via.length > 0);
  const number = (s: string | undefined) => (s !== undefined && s !== "" && !Number.isNaN(Number(s)) ? Number(s) : undefined);
  // The spec's order is a string compared as text; a space made by this app writes numbers, so those compare as numbers.
  const sorted = kids
    .map((c, i) => ({ c, i }))
    .sort((x, y) => {
      const ox = x.c.content.order;
      const oy = y.c.content.order;
      if ((ox === undefined) !== (oy === undefined)) return ox === undefined ? 1 : -1;
      if (ox !== undefined && oy !== undefined && ox !== oy) {
        const nx = number(ox);
        const ny = number(oy);
        return nx !== undefined && ny !== undefined ? nx - ny : ox < oy ? -1 : 1;
      }
      return x.c.state_key < y.c.state_key ? -1 : x.c.state_key > y.c.state_key ? 1 : x.i - y.i;
    });
  return sorted.map(({ c }) => {
    const r = info.get(c.state_key);
    return {
      roomId: c.state_key,
      via: c.content.via ?? [],
      order: c.content.order,
      name: r?.name,
      avatar: r?.avatar_url,
      isSpace: r?.room_type === "m.space",
    };
  });
}

/** The order that puts a child first or last among those listed (numbers, as a space made here writes them). */
export function orderFor(kids: ListedChild[], roomId: string, to: "first" | "last"): string {
  const others = kids
    .filter((k) => k.roomId !== roomId)
    .map((k) => Number(k.order))
    .filter((n) => !Number.isNaN(n));
  return String(to === "first" ? Math.min(0, ...others) - 1 : Math.max(0, ...others) + 1);
}

export async function putState(f: Fetch, a: Account, roomId: string, type: string, key: string, content: unknown): Promise<void> {
  const res = await send(
    f,
    `${root(a)}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/${encodeURIComponent(type)}/${encodeURIComponent(key)}`,
    a,
    "PUT",
    content,
  );
  if (res.ok) return;
  throw new EngineError(res.status === 403 ? "forbidden" : "unknown", `could not change the space (${res.status})`);
}

/** The child as the app lists it, from what the server and my own list say. */
export function toSpaceChild(
  k: ListedChild,
  mine: { name: string; avatar?: string | undefined; unreadCount: number; highlightCount: number; isSpace?: boolean | undefined } | undefined,
): SpaceChild {
  const avatar = mine?.avatar ?? k.avatar;
  return {
    roomId: k.roomId,
    name: mine?.name ?? k.name ?? k.roomId,
    ...(avatar && { avatar }),
    isSpace: mine?.isSpace ?? k.isSpace,
    ...(!mine && k.via.length ? { via: k.via } : {}),
    unreadCount: mine?.unreadCount ?? 0,
    highlightCount: mine?.highlightCount ?? 0,
  };
}
