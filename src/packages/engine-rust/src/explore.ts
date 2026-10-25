import { EngineError, type PublicRoom } from "@ohmatrix/core";
import { ask, base, type Account, type Fetch } from "./devices.js";

interface Chunk {
  room_id: string;
  name?: string;
  topic?: string;
  canonical_alias?: string;
  avatar_url?: string;
  num_joined_members?: number;
}

/** One page of the server's public room directory, matching `term` when there is one. */
export async function exploreRooms(f: Fetch, a: Account, term: string, since?: string, server?: string): Promise<{ rooms: PublicRoom[]; next?: string }> {
  const t = term.trim();
  const r = await ask(f, `${base(a)}/publicRooms${server ? `?server=${encodeURIComponent(server)}` : ""}`, a, {
    method: "POST",
    body: { limit: 20, ...(t && { filter: { generic_search_term: t } }), ...(since && { since }) },
  });
  if (!r.ok) throw new EngineError(r.status === 401 ? "unauthorized" : "unknown", String(r.body["error"] ?? "could not list the public rooms"));
  const chunk = (r.body["chunk"] as Chunk[] | undefined) ?? [];
  const next = r.body["next_batch"];
  return {
    rooms: chunk.map((c) => ({
      roomId: c.room_id,
      name: c.name || c.canonical_alias || c.room_id,
      ...(c.topic && { topic: c.topic }),
      ...(c.canonical_alias && { alias: c.canonical_alias }),
      ...(c.avatar_url && { avatar: c.avatar_url }),
      members: c.num_joined_members ?? 0,
    })),
    ...(typeof next === "string" && next && { next }),
  };
}
