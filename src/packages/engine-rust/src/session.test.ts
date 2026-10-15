import { expect, test } from "vitest";
import { fromSession, toSession, type FfiSession } from "./session.js";

const ffi: FfiSession = {
  accessToken: "tok",
  refreshToken: "ref",
  userId: "@a:s",
  deviceId: "DEV",
  homeserverUrl: "http://s",
  slidingSyncVersion: { tag: "Native" },
};

test("the SDK's session survives a round trip through ours, with its private fields", () => {
  const ours = toSession(ffi);
  expect(ours).toMatchObject({ homeserver: "http://s", userId: "@a:s", deviceId: "DEV", accessToken: "tok" });
  expect(typeof ours.native).toBe("string");
  expect(fromSession(ours, { tag: "None" })).toEqual({ ...ffi, oauthData: undefined });
});

test("a session without the engine's extras still restores: the sliding sync version is the fallback", () => {
  const back = fromSession({ homeserver: "http://s", userId: "@a:s", deviceId: "D", accessToken: "t" }, { tag: "Native" });
  expect(back).toMatchObject({ accessToken: "t", slidingSyncVersion: { tag: "Native" } });
  expect(back.refreshToken).toBeUndefined();
  // ...and so does one whose extras are damaged.
  expect(fromSession({ homeserver: "h", userId: "u", deviceId: "d", accessToken: "t", native: "{not json" }, "fb").slidingSyncVersion).toBe("fb");
});
