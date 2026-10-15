import { expect, test } from "vitest";
import { readStatus, register, writeStatus, STATUS_FIELD } from "./account.js";
import type { Account, Fetch } from "./devices.js";

const account: Account = { homeserverUrl: "http://s/", accessToken: "t", userId: "@me:s", deviceId: "D" };

/** Replies in turn, and writes down what was asked. */
const serve = (...replies: { status: number; body: unknown }[]) => {
  const asked: { url: string; method?: string | undefined; body?: unknown }[] = [];
  const f: Fetch = async (url, init) => {
    asked.push({ url, method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined });
    const r = replies.shift() ?? { status: 200, body: {} };
    return { ok: r.status < 300, status: r.status, json: async () => r.body };
  };
  return { f, asked };
};

test("registering answers a server that wants nothing more than the dummy step", async () => {
  const { f, asked } = serve(
    { status: 401, body: { session: "S", flows: [{ stages: ["m.login.dummy"] }] } },
    { status: 200, body: { user_id: "@new:s", device_id: "DEV", access_token: "tok" } },
  );
  expect(await register(f, "http://s/", "new", "pw", "Phone")).toEqual({ homeserver: "http://s", userId: "@new:s", deviceId: "DEV", accessToken: "tok" });
  expect(asked[1]?.body).toEqual({ username: "new", password: "pw", initial_device_display_name: "Phone", auth: { type: "m.login.dummy", session: "S" } });
});

test("registering is refused as the server says: a taken name, closed registration, or more steps than a password form can do", async () => {
  await expect(register(serve({ status: 400, body: { errcode: "M_USER_IN_USE", error: "taken" } }).f, "http://s", "a", "b", "d")).rejects.toMatchObject({
    code: "conflict",
  });
  await expect(register(serve({ status: 403, body: { errcode: "M_FORBIDDEN", error: "closed" } }).f, "http://s", "a", "b", "d")).rejects.toMatchObject({
    code: "forbidden",
  });
  await expect(register(serve({ status: 401, body: { flows: [{ stages: ["m.login.recaptcha"] }] } }).f, "http://s", "a", "b", "d")).rejects.toMatchObject({
    code: "unsupported",
  });
});

test("the status line is read from, written to and cleared from the profile", async () => {
  expect(await readStatus(serve({ status: 200, body: { displayname: "Me", [STATUS_FIELD]: "busy" } }).f, account)).toBe("busy");
  expect(await readStatus(serve({ status: 200, body: { displayname: "Me" } }).f, account)).toBeUndefined();
  const { f, asked } = serve();
  await writeStatus(f, account, "  away ");
  await writeStatus(f, account, " ");
  expect(asked).toEqual([
    { url: `http://s/_matrix/client/v3/profile/%40me%3As/${STATUS_FIELD}`, method: "PUT", body: { [STATUS_FIELD]: "away" } },
    { url: `http://s/_matrix/client/v3/profile/%40me%3As/${STATUS_FIELD}`, method: "DELETE", body: undefined },
  ]);
  await expect(writeStatus(serve({ status: 404, body: { errcode: "M_UNRECOGNIZED" } }).f, account, "x")).rejects.toMatchObject({ code: "unsupported" });
});
