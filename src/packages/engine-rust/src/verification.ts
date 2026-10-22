import type { VerificationEmoji, VerificationFlow } from "@ohmatrix/core";

/** What the SDK's verification controller reports, in our words. */
export type VerifyEvent =
  | { kind: "request"; userId: string; flowId: string; deviceName?: string | undefined }
  | { kind: "accepted" }
  | { kind: "started" }
  | { kind: "emojis"; emojis: VerificationEmoji[] }
  | { kind: "cancelled" }
  | { kind: "failed" }
  | { kind: "finished" };

/** One verification, started from here or from another device; the SDK holds one at a time. */
export interface SdkVerification {
  /** Where the events go (one listener). */
  listen(cb: (e: VerifyEvent) => void): void;
  /** Ask another session of mine. */
  requestSession(): Promise<void>;
  requestUser(userId: string): Promise<void>;
  /** Accept the request that came in from `userId` (`flowId` is from its event). */
  accept(userId: string, flowId: string): Promise<void>;
  /** Move an accepted request on to comparing pictures. */
  startEmojis(): Promise<void>;
  approve(): Promise<void>;
  decline(): Promise<void>;
  cancel(): Promise<void>;
}

/**
 * The verification on screen after `event`.
 * A finished or stopped one stays until the screen forgets it; a late event of one that is gone changes nothing.
 */
export function flowAfter(flow: VerificationFlow | null, event: VerifyEvent): VerificationFlow | null {
  switch (event.kind) {
    case "request":
      return { phase: "requested", incoming: true, userId: event.userId, ...(event.deviceName && { deviceName: event.deviceName }) };
    case "accepted":
    case "started":
      return flow && flow.phase !== "done" && flow.phase !== "cancelled" && flow.phase !== "failed" ? { phase: "waiting", userId: flow.userId } : flow;
    case "emojis":
      return flow ? { phase: "emojis", userId: flow.userId, emojis: event.emojis } : flow;
    case "finished":
      return flow ? { phase: "done", userId: flow.userId } : flow;
    case "cancelled":
      return flow && flow.phase !== "done" ? { phase: "cancelled", userId: flow.userId } : flow;
    case "failed":
      return flow && flow.phase !== "done" ? { phase: "failed", userId: flow.userId } : flow;
  }
}

/** A request I make: shown at once, before the other side has answered. */
export function outgoing(userId: string): VerificationFlow {
  return { phase: "requested", incoming: false, userId };
}
