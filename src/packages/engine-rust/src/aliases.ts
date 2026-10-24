import { EngineError } from "@ohmatrix/core";
import type { Account, Fetch } from "./devices.js";
import { putState } from "./spaces.js";

/** What a person typed as an address, as the part before the server name: `#team:x`, `team:x` and `Team` give `team`. */
export const aliasLocalpart = (input: string): string => input.trim().replace(/^#/, "").replace(/:.*$/, "").toLowerCase().replace(/\s+/g, "-");

/** The full address on my server. */
export function aliasOn(a: Account, input: string): string {
  const local = aliasLocalpart(input);
  if (!/^[a-z0-9._=\-/+]+$/.test(local)) throw new EngineError("unknown", "invalid address");
  return `#${local}:${a.userId.split(":").slice(1).join(":")}`;
}

async function directory(f: Fetch, a: Account, alias: string, method: "PUT" | "DELETE", body?: unknown) {
  let res;
  try {
    res = await f(`${a.homeserverUrl.replace(/\/+$/, "")}/_matrix/client/v3/directory/room/${encodeURIComponent(alias)}`, {
      method,
      headers: { Authorization: `Bearer ${a.accessToken}`, "Content-Type": "application/json" },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    });
  } catch (e) {
    throw new EngineError("network", e instanceof Error ? e.message : "could not reach the server");
  }
  if (res.ok) return;
  throw new EngineError(
    res.status === 409 ? "conflict" : res.status === 403 ? "forbidden" : res.status === 404 ? "not_found" : "unknown",
    `could not change the address (${res.status})`,
  );
}

/** The room's addresses as they stand: the main one, then the others. */
export interface Aliases {
  main?: string | undefined;
  others: string[];
}

const all = (s: Aliases) => [...(s.main ? [s.main] : []), ...s.others];

const canonical = (f: Fetch, a: Account, roomId: string, main: string | undefined, others: string[]) =>
  putState(f, a, roomId, "m.room.canonical_alias", "", { ...(main ? { alias: main } : {}), alt_aliases: others.filter((x) => x !== main) });

/** The addresses in the content of an `m.room.canonical_alias` event: the main one, then the others (none that is not text). */
export function aliasesOf(content: unknown): Aliases {
  const c = (content ?? {}) as { alias?: unknown; alt_aliases?: unknown };
  const main = typeof c.alias === "string" && c.alias ? c.alias : undefined;
  const others = Array.isArray(c.alt_aliases) ? c.alt_aliases.filter((x): x is string => typeof x === "string" && x !== main) : [];
  return { main, others };
}

/**
 * The room's addresses as the server has them now. The SDK's own view of a room can lack them (it only holds what the chat list asked for), so
 * the details page asks when the SDK has none. A room with no address, or one that cannot be read, gives none.
 */
export async function readAliases(f: Fetch, a: Account, roomId: string): Promise<Aliases> {
  const url = `${a.homeserverUrl.replace(/\/+$/, "")}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/state/m.room.canonical_alias/`;
  let res;
  try {
    res = await f(url, { method: "GET", headers: { Authorization: `Bearer ${a.accessToken}` } });
  } catch (e) {
    throw new EngineError("network", e instanceof Error ? e.message : "could not reach the server");
  }
  if (res.status === 404 || res.status === 403) return { others: [] };
  if (!res.ok) throw new EngineError("unknown", `could not read the addresses (${res.status})`);
  return aliasesOf(await res.json().catch(() => undefined));
}

/** Whether the address can be made: the server's directory answers 404 for a name nobody has, and a room for one that is taken. */
export async function checkAlias(f: Fetch, a: Account, input: string): Promise<"free" | "taken" | "invalid"> {
  const local = aliasLocalpart(input);
  if (!local || !/^[a-z0-9._=\-/+]+$/.test(local)) return "invalid";
  const alias = `#${local}:${a.userId.split(":").slice(1).join(":")}`;
  let res;
  try {
    res = await f(`${a.homeserverUrl.replace(/\/+$/, "")}/_matrix/client/v3/directory/room/${encodeURIComponent(alias)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${a.accessToken}` },
    });
  } catch (e) {
    throw new EngineError("network", e instanceof Error ? e.message : "could not reach the server");
  }
  if (res.ok) return "taken";
  if (res.status === 404) return "free";
  throw new EngineError("unknown", `could not check the address (${res.status})`);
}

/** Make an address for the room and list it (as the main one when the room has none). Resolves with the address. */
export async function addAlias(f: Fetch, a: Account, roomId: string, input: string, now: Aliases): Promise<string> {
  const alias = aliasOn(a, input);
  await directory(f, a, alias, "PUT", { room_id: roomId });
  const main = now.main ?? alias;
  await canonical(f, a, roomId, main, [...all(now), alias]);
  return alias;
}

/** Stop listing an address and delete it (an address this server did not make is only unlisted). */
export async function removeAlias(f: Fetch, a: Account, roomId: string, alias: string, now: Aliases): Promise<"released" | "unlisted"> {
  const rest = all(now).filter((x) => x !== alias);
  const main = now.main === alias ? rest[0] : now.main;
  await canonical(f, a, roomId, main, rest);
  // Only the server the name ends with can free it (and only for its creator or a server admin); otherwise it stays taken, unlisted.
  if (!alias.endsWith(`:${a.userId.split(":").slice(1).join(":")}`)) return "unlisted";
  return directory(f, a, alias, "DELETE").then(
    () => "released" as const,
    () => "unlisted" as const,
  );
}

export async function setMainAlias(f: Fetch, a: Account, roomId: string, alias: string, now: Aliases): Promise<void> {
  if (!all(now).includes(alias)) throw new EngineError("not_found", "unknown address");
  await canonical(f, a, roomId, alias, all(now));
}
