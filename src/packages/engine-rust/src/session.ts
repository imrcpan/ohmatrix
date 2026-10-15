import type { Session } from "@ohmatrix/core";

/** The fields of matrix-sdk-ffi's `Session` we use, and the sliding sync version it carries. */
export interface FfiSession {
  accessToken: string;
  refreshToken?: string | undefined;
  userId: string;
  deviceId: string;
  homeserverUrl: string;
  oauthData?: string | undefined;
  slidingSyncVersion: unknown;
}

/** What goes into `Session.native`: everything the SDK needs to restore the session that our own fields do not hold. */
interface Extra {
  refreshToken?: string;
  oauthData?: string;
  slidingSyncVersion: unknown;
}

/** The SDK's session as ours: the four common fields, and the rest as the engine's private `native` string. */
export function toSession(s: FfiSession): Session {
  const extra: Extra = { slidingSyncVersion: s.slidingSyncVersion };
  if (s.refreshToken) extra.refreshToken = s.refreshToken;
  if (s.oauthData) extra.oauthData = s.oauthData;
  return { homeserver: s.homeserverUrl, userId: s.userId, deviceId: s.deviceId, accessToken: s.accessToken, native: JSON.stringify(extra) };
}

/**
 * Our session as the SDK's. A session from another engine (no `native`) is restored without the extras: the sliding
 * sync version is then found out again, and there is no refresh token to use.
 */
export function fromSession(s: Session, fallbackSlidingSync: unknown): FfiSession {
  let extra: Partial<Extra> = {};
  if (s.native) {
    try {
      extra = JSON.parse(s.native) as Partial<Extra>;
    } catch {
      /* a damaged value is the same as none */
    }
  }
  return {
    accessToken: s.accessToken,
    refreshToken: extra.refreshToken,
    userId: s.userId,
    deviceId: s.deviceId,
    homeserverUrl: s.homeserver,
    oauthData: extra.oauthData,
    slidingSyncVersion: extra.slidingSyncVersion ?? fallbackSlidingSync,
  };
}
