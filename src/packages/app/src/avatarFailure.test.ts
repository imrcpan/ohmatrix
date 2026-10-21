import { expect, test } from "vitest";
import { EngineError } from "@ohmatrix/core";
import { avatarFailure } from "./avatarFailure.js";

// The text of a key and its values, so that what is asked for shows.
const t = (key: string, v?: Record<string, string | number>) => (v ? `${key}(${Object.values(v).join(",")})` : key);

test("a known cause is said by what it means", () => {
  expect(avatarFailure(new EngineError("network", "x"), t)).toBe("avatar.failed(avatar.reason.network)");
  expect(avatarFailure(new EngineError("forbidden", "x"), t)).toBe("avatar.failed(avatar.reason.forbidden)");
  expect(avatarFailure(new EngineError("rate_limited", "x"), t)).toBe("avatar.failed(avatar.reason.rate)");
  expect(avatarFailure(new EngineError("unauthorized", "x"), t)).toBe("avatar.failed(avatar.reason.auth)");
  expect(avatarFailure(new EngineError("unsupported", "x"), t)).toBe("avatar.failed(avatar.reason.unsupported)");
});

test("a file the server finds too big is said so, whatever code it came with", () => {
  expect(avatarFailure(new EngineError("unknown", "M_TOO_LARGE: Upload request body is too large"), t)).toBe("avatar.failed(avatar.reason.large)");
  expect(avatarFailure(new Error("HTTP 413"), t)).toBe("avatar.failed(avatar.reason.large)");
});

test("anything else shows what was said, cut short, or that nothing was said", () => {
  expect(avatarFailure(new EngineError("unknown", "disk is full"), t)).toBe("avatar.failed(disk is full)");
  expect(avatarFailure(new Error("x".repeat(500)), t)).toBe(`avatar.failed(${"x".repeat(160)})`);
  expect(avatarFailure(new Error(""), t)).toBe("avatar.failed(avatar.reason.unknown)");
  // A native error: what was called is left out, the cause is kept.
  expect(avatarFailure(new Error("Call to function 'FileSystemFile.bytes' has been rejected.\n→ Caused by: java.io.FileNotFoundException: /x.jpg"), t)).toBe(
    "avatar.failed(java.io.FileNotFoundException: /x.jpg)",
  );
});
