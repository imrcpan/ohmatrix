import { EngineError, type DeviceInfo } from "@ohmatrix/core";

export type Fetch = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Where and as whom to ask the homeserver. */
export interface Account {
  homeserverUrl: string;
  accessToken: string;
  userId: string;
  deviceId: string;
}

const base = (a: Account) => `${a.homeserverUrl.replace(/\/+$/, "")}/_matrix/client/v3`;
const headers = (a: Account) => ({ Authorization: `Bearer ${a.accessToken}`, "Content-Type": "application/json" });

async function ask(f: Fetch, url: string, a: Account, init: { method?: string; body?: unknown } = {}) {
  let res;
  try {
    res = await f(url, { method: init.method ?? "GET", headers: headers(a), ...(init.body !== undefined && { body: JSON.stringify(init.body) }) });
  } catch (e) {
    throw new EngineError("network", e instanceof Error ? e.message : "could not reach the server");
  }
  return { status: res.status, ok: res.ok, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** My sessions: this one first, then the most recently used. */
export async function listDevices(f: Fetch, a: Account): Promise<DeviceInfo[]> {
  const r = await ask(f, `${base(a)}/devices`, a);
  if (!r.ok) throw new EngineError(r.status === 401 ? "unauthorized" : "unknown", String(r.body["error"] ?? "could not list the sessions"));
  const list = (r.body["devices"] as { device_id: string; display_name?: string; last_seen_ip?: string; last_seen_ts?: number }[] | undefined) ?? [];
  return list
    .map((d): DeviceInfo => ({
      id: d.device_id,
      name: d.display_name || d.device_id,
      ...(d.last_seen_ts !== undefined && { lastSeenTs: d.last_seen_ts }),
      ...(d.last_seen_ip && { lastSeenIp: d.last_seen_ip.replace(/^::ffff:/, "") }),
      current: d.device_id === a.deviceId,
    }))
    .sort((x, y) => Number(y.current) - Number(x.current) || (y.lastSeenTs ?? 0) - (x.lastSeenTs ?? 0));
}

/** Sign out other sessions: the server asks for the account password, in two steps (a session, then the answer). */
export async function removeDevices(f: Fetch, a: Account, ids: string[], password: string): Promise<void> {
  if (!ids.length) return;
  const url = `${base(a)}/delete_devices`;
  const first = await ask(f, url, a, { method: "POST", body: { devices: ids } });
  if (first.ok) return;
  const session = first.body["session"];
  if (first.status !== 401 || typeof session !== "string") throw new EngineError("unknown", String(first.body["error"] ?? "could not sign the sessions out"));
  const user = a.userId.replace(/^@/, "").replace(/:.*$/, "");
  const second = await ask(f, url, a, {
    method: "POST",
    body: { devices: ids, auth: { type: "m.login.password", identifier: { type: "m.id.user", user }, password, session } },
  });
  if (second.ok) return;
  throw new EngineError(
    second.status === 401 || second.status === 403 ? "forbidden" : "unknown",
    String(second.body["error"] ?? "could not sign the sessions out"),
  );
}
