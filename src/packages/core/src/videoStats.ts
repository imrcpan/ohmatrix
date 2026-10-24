/** A statistics report as the browsers and react-native-webrtc give it: it can be walked, and an entry found by its id. */
export interface StatsReport {
  forEach(cb: (v: Record<string, unknown>) => void): void;
}

const isVideo = (v: Record<string, unknown>) => (v["kind"] ?? v["mediaType"]) === "video";
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** The name of the codec an RTP entry uses (`H264`), from the codec entry it points to. */
function codecName(all: Record<string, unknown>[], v: Record<string, unknown>): string | undefined {
  const mime = v["codecId"] ? (all.find((x) => x["id"] === v["codecId"] && x["type"] === "codec")?.["mimeType"] as string | undefined) : undefined;
  return mime?.replace(/^video\//i, "").toUpperCase();
}

/**
 * How far the video of a connection has got, each way, and the codec it is sent with. It counts frames, not bytes: bytes arrive when a picture
 * cannot be shown (a codec that cannot be decoded here, a stream that waits for a key frame that never comes), and bytes leave a sender whose
 * encoder produces nothing useful. A report with no frame counts (an old one) is counted in bytes.
 */
export function readVideoProgress(report: StatsReport): { sent: number; received: number; sendingCodec?: string } {
  const all: Record<string, unknown>[] = [];
  report.forEach((v) => all.push(v));
  let sent = 0;
  let received = 0;
  let sendingCodec: string | undefined;
  for (const v of all.filter(isVideo)) {
    if (v["type"] === "outbound-rtp") {
      sent += num(v["framesEncoded"]) ?? num(v["framesSent"]) ?? num(v["bytesSent"]) ?? 0;
      sendingCodec ??= codecName(all, v);
    }
    if (v["type"] === "inbound-rtp") received += num(v["framesDecoded"]) ?? num(v["bytesReceived"]) ?? 0;
  }
  return { sent, received, ...(sendingCodec ? { sendingCodec } : {}) };
}

/** What the video's statistics say, in one line for the log: frames, key frames, the encoder and decoder, resolution, repeated requests for a key frame. */
export function describeVideoStats(report: StatsReport): string {
  const all: Record<string, unknown>[] = [];
  report.forEach((v) => all.push(v));
  const parts: string[] = [];
  const item = (label: string, value: unknown) => (value === undefined || value === "" ? "" : ` ${label}=${String(value)}`);
  for (const v of all.filter(isVideo)) {
    if (v["type"] === "outbound-rtp")
      parts.push(
        `video out${item("codec", codecName(all, v))}${item("frames", v["framesEncoded"])}${item("keys", v["keyFramesEncoded"])}${item("encoder", v["encoderImplementation"])}${item("size", v["frameWidth"] && v["frameHeight"] ? `${String(v["frameWidth"])}x${String(v["frameHeight"])}` : undefined)}${item("limited", v["qualityLimitationReason"] === "none" ? undefined : v["qualityLimitationReason"])}${item("pli", v["pliCount"])}`,
      );
    if (v["type"] === "inbound-rtp")
      parts.push(
        `video in${item("codec", codecName(all, v))}${item("frames", v["framesDecoded"])}${item("keys", v["keyFramesDecoded"])}${item("decoder", v["decoderImplementation"])}${item("size", v["frameWidth"] && v["frameHeight"] ? `${String(v["frameWidth"])}x${String(v["frameHeight"])}` : undefined)}${item("lost", v["packetsLost"])}${item("nack", v["nackCount"])}${item("pli", v["pliCount"])}${item("frozen", v["freezeCount"])}`,
      );
  }
  return parts.join(" ; ") || "video (no entry)";
}
