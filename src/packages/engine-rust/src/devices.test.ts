import { expect, test } from "vitest";
import { listDevices, removeDevices, type Account, type Fetch } from "./devices.js";

const account: Account = { homeserverUrl: "http://s/", accessToken: "tok", userId: "@me:s", deviceId: "B" };

const serve = (
  routes: (url: string, body: unknown) => { status: number; body: unknown }[] | { status: number; body: unknown },
): { f: Fetch; log: { url: string; method?: string | undefined; body: unknown }[] } => {
  const log: { url: string; method?: string | undefined; body: unknown }[] = [];
  const queue: { status: number; body: unknown }[] = [];
  const f: Fetch = async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    log.push({ url, method: init?.method, body });
    if (!queue.length) {
      const r = routes(url, body);
      queue.push(...(Array.isArray(r) ? r : [r]));
    }
    const r = queue.shift()!;
    return { ok: r.status < 300, status: r.status, json: async () => r.body };
  };
  return { f, log };
};

test("sessions: this one first, then by last use, with a name even when it has none", async () => {
  const { f, log } = serve(() => ({
    status: 200,
    body: {
      devices: [
        { device_id: "A", display_name: "Phone", last_seen_ts: 5 },
        { device_id: "C", last_seen_ts: 9, last_seen_ip: "1.2.3.4" },
        { device_id: "B", display_name: "Here", last_seen_ts: 1 },
      ],
    },
  }));
  expect(await listDevices(f, account)).toEqual([
    { id: "B", name: "Here", lastSeenTs: 1, current: true },
    { id: "C", name: "C", lastSeenTs: 9, lastSeenIp: "1.2.3.4", current: false },
    { id: "A", name: "Phone", lastSeenTs: 5, current: false },
  ]);
  expect(log[0]?.url).toBe("http://s/_matrix/client/v3/devices");
});

test("signing sessions out answers the server's password step", async () => {
  const { f, log } = serve(() => [
    { status: 401, body: { session: "sess", flows: [] } },
    { status: 200, body: {} },
  ]);
  await removeDevices(f, account, ["A", "C"], "secret");
  expect(log.map((l) => l.body)).toEqual([
    { devices: ["A", "C"] },
    { devices: ["A", "C"], auth: { type: "m.login.password", identifier: { type: "m.id.user", user: "me" }, password: "secret", session: "sess" } },
  ]);
});

test("a wrong password is forbidden; no sessions means no request", async () => {
  const wrong = serve(() => [
    { status: 401, body: { session: "sess" } },
    { status: 401, body: { errcode: "M_FORBIDDEN", error: "Invalid password" } },
  ]);
  await expect(removeDevices(wrong.f, account, ["A"], "nope")).rejects.toMatchObject({ code: "forbidden" });
  const none = serve(() => ({ status: 200, body: {} }));
  await removeDevices(none.f, account, [], "x");
  expect(none.log).toEqual([]);
});
