import { EngineError } from "@ohmatrix/core";
import { expect, test } from "vitest";
import { guard, toEngineError } from "./errors.js";

const api = (kind: string | undefined, code: string, msg = "x") => ({
  tag: "MatrixApi" as const,
  inner: { msg, code, kind: kind ? { tag: kind } : undefined },
});

test("what the homeserver answered is mapped by its Matrix error", () => {
  expect(toEngineError(api("Forbidden", "M_FORBIDDEN")).code).toBe("forbidden");
  expect(toEngineError(api("UnknownToken", "M_UNKNOWN_TOKEN")).code).toBe("unauthorized");
  expect(toEngineError(api("UserInUse", "M_USER_IN_USE")).code).toBe("conflict");
  expect(toEngineError(api("LimitExceeded", "M_LIMIT_EXCEEDED")).code).toBe("rate_limited");
  expect(toEngineError(api("NotFound", "M_NOT_FOUND")).code).toBe("not_found");
  expect(toEngineError(api(undefined, "M_USER_IN_USE")).code).toBe("conflict"); // by the code when the kind is not one we know
  expect(toEngineError(api("SomethingNew", "M_SOMETHING_NEW")).code).toBe("unknown");
});

test("a failure that never reached the server is a network error, but an answer is never taken for one", () => {
  expect(toEngineError({ tag: "Generic", inner: { msg: "error sending request for url (http://x/_matrix)" } }).code).toBe("network");
  expect(toEngineError(new Error("Connection refused (os error 111)")).code).toBe("network");
  expect(toEngineError({ tag: "Generic", inner: { msg: "something else broke" } }).code).toBe("unknown");
  // The server said no, and its words happen to contain "timeout": still its answer.
  expect(toEngineError(api(undefined, "M_UNKNOWN", "request timed out upstream")).code).toBe("unknown");
});

test("an EngineError passes through as it is, and guard rethrows what failed as one", async () => {
  const e = new EngineError("not_found", "gone");
  expect(toEngineError(e)).toBe(e);
  await expect(guard(async () => Promise.reject(api("Forbidden", "M_FORBIDDEN", "no")))).rejects.toMatchObject({
    name: "EngineError",
    code: "forbidden",
    message: "no",
  });
  await expect(guard(async () => 7)).resolves.toBe(7);
});
