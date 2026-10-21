import { EngineError, registerSteps, type Session } from "@ohmatrix/core";
import type { Account, Fetch } from "./devices.js";

/** The custom profile field the status line lives in (the same one the web app uses). */
export const STATUS_FIELD = "com.ohmatrix.status";

const root = (url: string) => url.replace(/\/+$/, "");

async function call(f: Fetch, url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) {
  try {
    const res = await f(url, init);
    return { ok: res.ok, status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch (e) {
    throw new EngineError("network", e instanceof Error ? e.message : "could not reach the server");
  }
}

/**
 * Make an account with a username and password (and a registration token, when the server asks for one). The steps are in
 * `registerSteps`; here the requests are sent.
 */
export async function register(f: Fetch, homeserverUrl: string, username: string, password: string, deviceName: string, token?: string): Promise<Session> {
  const url = `${root(homeserverUrl)}/_matrix/client/v3/register`;
  const post = (body: unknown) => call(f, url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const res = await registerSteps(post, { username, password, initial_device_display_name: deviceName }, token);
  const { user_id, device_id, access_token } = res.body as { user_id?: string; device_id?: string; access_token?: string };
  if (!user_id || !device_id || !access_token) throw new EngineError("unknown", "The server did not sign the new account in.");
  return { homeserver: root(homeserverUrl), userId: user_id, deviceId: device_id, accessToken: access_token };
}

const profileUrl = (a: Account) => `${root(a.homeserverUrl)}/_matrix/client/v3/profile/${encodeURIComponent(a.userId)}`;
const auth = (a: Account) => ({ Authorization: `Bearer ${a.accessToken}`, "Content-Type": "application/json" });

/** My status line, when the server keeps one (a custom profile field). */
export async function readStatus(f: Fetch, a: Account): Promise<string | undefined> {
  const res = await call(f, profileUrl(a), { headers: auth(a) });
  const v = res.ok ? res.body[STATUS_FIELD] : undefined;
  return typeof v === "string" && v ? v : undefined;
}

/** Set the status line; empty clears it. A server without custom profile fields refuses as `unsupported`. */
export async function writeStatus(f: Fetch, a: Account, status: string): Promise<void> {
  const text = status.trim();
  const url = `${profileUrl(a)}/${STATUS_FIELD}`;
  const res = await call(
    f,
    url,
    text ? { method: "PUT", headers: auth(a), body: JSON.stringify({ [STATUS_FIELD]: text }) } : { method: "DELETE", headers: auth(a) },
  );
  if (res.ok) return;
  if (res.body["errcode"] === "M_UNRECOGNIZED" || res.status === 404 || res.status === 405)
    throw new EngineError("unsupported", "This server does not support profile status.");
  throw new EngineError(res.status === 403 ? "forbidden" : "unknown", String(res.body["error"] ?? "could not set the status"));
}
