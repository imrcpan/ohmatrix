import { EngineError } from "@ohmatrix/core";
import type { Translate } from "./chat/types.js";

/**
 * Why something could not be done, in words for the person: a known cause by what it means (no connection, too big, not allowed...),
 * and for anything else what the server or the phone said, so that a notice is never just "failed".
 */
export function failureReason(e: unknown, t: Translate): string {
  // A native module's error says what was called first and the cause after "Caused by:": the cause is what the person can use.
  const whole = e instanceof Error ? e.message.trim() : String(e).trim();
  const said =
    whole
      .split(/→?\s*Caused by:\s*/)
      .pop()
      ?.trim() ?? whole;
  return (() => {
    if (/too.?large|payload too large|\b413\b|exceeds? .*(size|limit)/i.test(said)) return t("avatar.reason.large");
    if (e instanceof EngineError) {
      switch (e.code) {
        case "network":
          return t("avatar.reason.network");
        case "forbidden":
          return t("avatar.reason.forbidden");
        case "rate_limited":
          return t("avatar.reason.rate");
        case "unauthorized":
          return t("avatar.reason.auth");
        case "unsupported":
          return t("avatar.reason.unsupported");
        case "not_found":
          return t("avatar.reason.notFound");
        default:
      }
    }
    return said ? said.slice(0, 160) : t("avatar.reason.unknown");
  })();
}

/** Why a picture could not be uploaded, as the notice says it. */
export function avatarFailure(e: unknown, t: Translate): string {
  return t("avatar.failed", { reason: failureReason(e, t) });
}
