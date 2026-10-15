import type { SecurityState } from "@ohmatrix/core";

/** What the SDK says of this account's encryption. */
export interface RawSecurity {
  /** Whether the keys are kept in secret storage so a new device can get them back. */
  recovery: "Unknown" | "Enabled" | "Disabled" | "Incomplete";
  /** Whether this device is verified by the account's own keys; `undefined` while that is not known. */
  verified: boolean | undefined;
  /** There is a key backup on the server. */
  backupOnServer: boolean;
}

/**
 * Where the account stands, in the words the app acts on: nothing is set up yet, this device cannot read the history
 * until it gets the recovery key, or all is well. While the SDK has not found out yet it is `unavailable`, so the app
 * shows nothing rather than a prompt that may turn out wrong.
 */
export function securityStateOf(s: RawSecurity): SecurityState {
  if (s.recovery === "Unknown" && s.verified === undefined) return "unavailable";
  if (s.verified === true && s.recovery === "Enabled") return "ready";
  if (s.verified === true) return "needs_setup";
  // Not verified here: if the account has its keys kept somewhere, this device needs them; if not, nothing was set up.
  return s.recovery === "Enabled" || s.recovery === "Incomplete" || s.backupOnServer ? "needs_recovery" : "needs_setup";
}
