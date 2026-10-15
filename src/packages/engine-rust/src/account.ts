import { EngineError, type Session } from "@ohmatrix/core";
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
 * Make an account with a username and password. A server answers the first request with the steps it wants done; the
 * one we can do alone is the "dummy" step. Anything else (an e-mail address, a captcha, terms) is more than a password
 * form can answer.
 */
export async function register(f: Fetch, homeserverUrl: string, username: string, password: string, deviceName: string): Promise<Session> {
  const url = `${root(homeserverUrl)}/_matrix/client/v3/register`;
  const post = (body: unknown) => call(f, url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const base = { username, password, initial_device_display_name: deviceName };
  let res = await post(base);
  if (res.status === 401 && Array.isArray(res.body["flows"])) {
    const flows = res.body["flows"] as { stages: string[] }[];
    if (!flows.some((fl) => fl.stages.every((st) => st === "m.login.dummy")))
      throw new EngineError("unsupported", "This server needs more than a username and password to register.");
    const session = res.body["session"];
    res = await post({ ...base, auth: { type: "m.login.dummy", ...(typeof session === "string" && { session }) } });
  }
  if (!res.ok) {
    const code = String(res.body["errcode"] ?? "");
    const message = String(res.body["error"] ?? "could not register");
    throw new EngineError(code === "M_USER_IN_USE" ? "conflict" : code === "M_FORBIDDEN" ? "forbidden" : "unknown", message);
  }
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
