export type EngineErrorCode =
  | "network" // transient, retry later
  | "unauthorized" // token invalid/expired or logged out remotely: force re-login
  | "forbidden"
  | "conflict" // already exists (e.g. a room address that is taken)
  | "not_found"
  | "rate_limited"
  | "keys_lost" // this device's encryption keys are gone: it cannot be used any more, sign in again
  | "unsupported" // engine/homeserver lacks the capability
  | "token_required" // the server creates accounts only with a registration token, and none was given
  | "token_invalid" // the registration token that was given is not valid (wrong, used up or expired)
  | "unknown";

/** The only error type engines may throw across the boundary. */
export class EngineError extends Error {
  constructor(
    readonly code: EngineErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "EngineError";
  }
}
