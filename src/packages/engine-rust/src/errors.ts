import { EngineError, type EngineErrorCode } from "@ohmatrix/core";

/** The two shapes matrix-sdk-ffi's `ClientError` arrives in. Only what the mapping looks at. */
export interface FfiClientError {
  /** The variant: a plain failure, or an error the homeserver answered with. */
  tag?: "Generic" | "MatrixApi" | undefined;
  inner?: { msg?: string; code?: string; kind?: { tag?: string } | undefined; details?: string | undefined } | undefined;
  message?: string | undefined;
}

/** Matrix error codes and the `ErrorKind` variants that carry them, to our codes. */
const BY_KIND: Record<string, EngineErrorCode> = {
  UnknownToken: "unauthorized",
  MissingToken: "unauthorized",
  Forbidden: "forbidden",
  LimitExceeded: "rate_limited",
  NotFound: "not_found",
  UserInUse: "conflict",
  RoomInUse: "conflict",
  Unrecognized: "unsupported",
  Unknown: "unknown",
};
const BY_CODE: Record<string, EngineErrorCode> = {
  M_UNKNOWN_TOKEN: "unauthorized",
  M_MISSING_TOKEN: "unauthorized",
  M_FORBIDDEN: "forbidden",
  M_LIMIT_EXCEEDED: "rate_limited",
  M_NOT_FOUND: "not_found",
  M_USER_IN_USE: "conflict",
  M_ROOM_IN_USE: "conflict",
  M_UNRECOGNIZED: "unsupported",
};

/** What a failure that never got an answer from the server looks like (no network, DNS, TLS, timeouts). */
const NETWORK =
  /(error sending request|connection (refused|reset|closed)|timed? ?out|dns|failed to lookup|network is unreachable|unreachable|offline|ssl|tls|certificate)/i;

/**
 * Maps whatever the bindings threw to the one error type engines may throw. An answer from the homeserver is mapped by
 * its Matrix error; anything else that looks like a failure to reach it is `network`; the rest is `unknown`.
 */
export function toEngineError(e: unknown): EngineError {
  if (e instanceof EngineError) return e;
  const err = (e ?? {}) as FfiClientError;
  const inner = err.inner;
  const message = inner?.msg ?? err.message ?? (e instanceof Error ? e.message : String(e));
  let code: EngineErrorCode = "unknown";
  if (inner?.kind?.tag && BY_KIND[inner.kind.tag]) code = BY_KIND[inner.kind.tag]!;
  else if (inner?.code && BY_CODE[inner.code]) code = BY_CODE[inner.code]!;
  else if (err.tag !== "MatrixApi" && NETWORK.test(`${message} ${inner?.details ?? ""}`)) code = "network";
  return new EngineError(code, message, e);
}

/** Runs `f` and rethrows its failure as an `EngineError`. */
export async function guard<T>(f: () => Promise<T>): Promise<T> {
  try {
    return await f();
  } catch (e) {
    throw toEngineError(e);
  }
}
