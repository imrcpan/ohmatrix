import { EngineError, STICKER_PACK_EVENT } from "@ohmatrix/core";
import type { Account, Fetch } from "./devices.js";

const url = (a: Account, type: string) => `${a.homeserverUrl.replace(/\/+$/, "")}/_matrix/client/v3/user/${encodeURIComponent(a.userId)}/account_data/${type}`;

/** One account data event as the account has it now; an account with none has an empty one. */
export async function readAccountData(f: Fetch, a: Account, type: string): Promise<unknown> {
  let res;
  try {
    res = await f(url(a, type), { method: "GET", headers: { Authorization: `Bearer ${a.accessToken}` } });
  } catch (e) {
    throw new EngineError("network", e instanceof Error ? e.message : "could not reach the server");
  }
  if (res.status === 404) return {};
  if (!res.ok) throw new EngineError("unknown", `could not read the stickers (${res.status})`);
  return res.json().catch(() => ({}));
}

/** Replace one account data event. */
export async function writeAccountData(f: Fetch, a: Account, type: string, content: unknown): Promise<void> {
  let res;
  try {
    res = await f(url(a, type), {
      method: "PUT",
      headers: { Authorization: `Bearer ${a.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });
  } catch (e) {
    throw new EngineError("network", e instanceof Error ? e.message : "could not reach the server");
  }
  if (!res.ok) throw new EngineError(res.status === 401 ? "unauthorized" : "unknown", `could not save the stickers (${res.status})`);
}

export const readPackContent = (f: Fetch, a: Account) => readAccountData(f, a, STICKER_PACK_EVENT);
export const writePackContent = (f: Fetch, a: Account, content: unknown) => writeAccountData(f, a, STICKER_PACK_EVENT, content);
