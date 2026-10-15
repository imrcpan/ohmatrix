import { expect, test } from "vitest";
import { securityStateOf, type RawSecurity } from "./security.js";

const of = (recovery: RawSecurity["recovery"], verified: boolean | undefined, backupOnServer = false) =>
  securityStateOf({ recovery, verified, backupOnServer });

test("nothing is said until the SDK knows", () => {
  expect(of("Unknown", undefined)).toBe("unavailable");
});

test("a verified device with its keys kept is ready; without them the account still needs setting up", () => {
  expect(of("Enabled", true)).toBe("ready");
  expect(of("Disabled", true)).toBe("needs_setup");
  expect(of("Incomplete", true)).toBe("needs_setup");
});

test("an unverified device needs the recovery key when the account has its keys somewhere", () => {
  expect(of("Enabled", false)).toBe("needs_recovery");
  expect(of("Incomplete", false)).toBe("needs_recovery");
  expect(of("Disabled", false, true)).toBe("needs_recovery");
  expect(of("Disabled", false)).toBe("needs_setup");
  expect(of("Unknown", false, true)).toBe("needs_recovery");
});
