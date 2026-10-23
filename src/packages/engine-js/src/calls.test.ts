import { describe, expect, it } from "vitest";
import { CallErrorCode } from "matrix-js-sdk/lib/webrtc/call.js";
import { endReasonOf } from "./calls.js";

describe("how a call ended", () => {
  it("is turned down when the other side puts the phone down while it rings, and a plain hangup otherwise", () => {
    expect(endReasonOf(CallErrorCode.UserHangup, false, true, false)).toBe("rejected");
    expect(endReasonOf(CallErrorCode.UserHangup, false, true, true)).toBe("cancelled");
    expect(endReasonOf(CallErrorCode.UserHangup, true, true, false)).toBe("hangup");
    expect(endReasonOf(CallErrorCode.UserHangup, false, false, false)).toBe("hangup");
    expect(endReasonOf(undefined, false, false, false)).toBe("hangup");
  });
  it("says busy, unanswered and no media for what they are, and anything else failed", () => {
    expect(endReasonOf(CallErrorCode.UserBusy, false, true, false)).toBe("busy");
    expect(endReasonOf(CallErrorCode.InviteTimeout, true, true, false)).toBe("unanswered");
    expect(endReasonOf(CallErrorCode.NoUserMedia, true, true, false)).toBe("no_media");
    expect(endReasonOf(CallErrorCode.IceFailed, false, false, false)).toBe("failed");
  });
});
