import { expect, test } from "vitest";
import { describeVideoStats, readVideoProgress } from "./videoStats.js";

const report = (...entries: Record<string, unknown>[]) => ({ forEach: (cb: (v: Record<string, unknown>) => void) => entries.forEach(cb) });
const codec = { type: "codec", id: "c1", mimeType: "video/VP8" };

test("progress is counted in frames: bytes that arrive when no picture can be shown are not progress", () => {
  const r = readVideoProgress(
    report(
      { type: "outbound-rtp", kind: "video", framesEncoded: 0, bytesSent: 9000, codecId: "c1" },
      { type: "inbound-rtp", kind: "video", framesDecoded: 0, bytesReceived: 120000 },
      { type: "outbound-rtp", kind: "audio", bytesSent: 77 },
      codec,
    ),
  );
  expect(r).toEqual({ sent: 0, received: 0, sendingCodec: "VP8" });
  const moving = readVideoProgress(
    report(
      { type: "outbound-rtp", kind: "video", framesEncoded: 30, bytesSent: 9000 },
      { type: "inbound-rtp", kind: "video", framesDecoded: 28, bytesReceived: 120000 },
    ),
  );
  expect(moving).toMatchObject({ sent: 30, received: 28 });
});

test("a report with no frame counts is counted in bytes, and one with no video is nothing", () => {
  expect(
    readVideoProgress(report({ type: "outbound-rtp", kind: "video", bytesSent: 1000 }, { type: "inbound-rtp", kind: "video", bytesReceived: 2500 })),
  ).toEqual({ sent: 1000, received: 2500 });
  expect(readVideoProgress(report())).toEqual({ sent: 0, received: 0 });
  expect(readVideoProgress(report({ type: "inbound-rtp", kind: "audio", bytesReceived: 5 }))).toEqual({ sent: 0, received: 0 });
});

test("the line for the log names the codec, the frames, the encoder and decoder, and what is off", () => {
  const line = describeVideoStats(
    report(
      {
        type: "outbound-rtp",
        kind: "video",
        codecId: "c1",
        framesEncoded: 90,
        keyFramesEncoded: 2,
        encoderImplementation: "libvpx",
        frameWidth: 640,
        frameHeight: 480,
        qualityLimitationReason: "none",
      },
      {
        type: "inbound-rtp",
        kind: "video",
        framesDecoded: 0,
        keyFramesDecoded: 0,
        decoderImplementation: "libvpx",
        packetsLost: 3,
        pliCount: 7,
        freezeCount: 0,
      },
      codec,
    ),
  );
  expect(line).toBe("video out codec=VP8 frames=90 keys=2 encoder=libvpx size=640x480 ; video in frames=0 keys=0 decoder=libvpx lost=3 pli=7 frozen=0");
  expect(describeVideoStats(report())).toBe("video (no entry)");
});
