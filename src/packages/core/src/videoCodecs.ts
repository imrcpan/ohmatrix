/** The codecs of an SDP's video that carry a picture (not the helpers that repair it: rtx, red, ulpfec, flexfec), in the order the SDP lists them. */
export function sdpVideoCodecs(sdp: string | undefined | null): string[] {
  if (!sdp) return [];
  const out: string[] = [];
  for (const section of sdp.split(/\r?\nm=/)) {
    const lines = section.split(/\r?\n/);
    if (!/^(m=)?video /.test(lines[0] ?? "")) continue;
    const types = (lines[0] ?? "").split(" ").slice(3);
    for (const pt of types) {
      const name = lines
        .find((l) => l.startsWith(`a=rtpmap:${pt} `))
        ?.slice(`a=rtpmap:${pt} `.length)
        .split("/")[0]
        ?.toUpperCase();
      if (name && !/^(RTX|RED|ULPFEC|FLEXFEC-03)$/.test(name) && !out.includes(name)) out.push(name);
    }
    break;
  }
  return out;
}

/**
 * The order to ask for the video codecs in. What the other side offered keeps its order (its choice is respected among equals), but a codec
 * this side cannot send comes after the ones it can: the sending codec is the first of the answer, and a codec that is only listed because
 * it can be received (a browser without an H264 encoder lists H264 all the same) would otherwise be picked and nothing would be sent.
 * A codec that was tried and sent nothing (`failed`) goes last. Codecs only this side knows follow the others.
 */
export function orderVideoCodecs(o: { offered: readonly string[]; sendable: readonly string[]; failed: readonly string[] }): string[] {
  const known = [...o.offered];
  for (const c of o.sendable) if (!known.includes(c)) known.push(c);
  const rank = (c: string) => (o.failed.includes(c) ? 2 : o.sendable.includes(c) ? 0 : 1);
  return known
    .map((c, i) => ({ c, i }))
    .sort((a, b) => rank(a.c) - rank(b.c) || a.i - b.i)
    .map((x) => x.c);
}

/** What the video of a connection is doing, once a second: bytes sent and received so far, and whether a picture is meant to be going each way. */
export interface VideoSample {
  now: number;
  sentBytes: number;
  receivedBytes: number;
  /** A camera is on here (the track is live and not turned off), so a picture is meant to be sent. */
  sending: boolean;
  /** The other side says its camera is on, so a picture is meant to arrive. */
  receiving: boolean;
}

/** What the watch found: the picture we send does not leave, or the one we are to receive does not come. */
export type VideoVerdict = "ok" | "send-stalled" | "receive-stalled";

/**
 * Watches the video of a call for a codec that does not work: a picture that is meant to go (or come) and has not moved a byte for
 * `stallMs`. The first `graceMs` after it starts are left alone (the first frames take a moment), and a camera that is off does not count.
 * After it has said so once for a direction, it stays quiet for that direction until `reset` (a new negotiation gives a new chance).
 */
export class VideoWatch {
  private startedAt: number | null = null;
  private sent = { bytes: -1, since: 0 };
  private received = { bytes: -1, since: 0 };
  private said = new Set<VideoVerdict>();
  private wasSending = true;
  private wasReceiving = true;

  constructor(
    private readonly graceMs = 2500,
    private readonly stallMs = 4000,
  ) {}

  /** Start again (a codec was changed). */
  reset(now: number): void {
    this.startedAt = now;
    this.sent = { bytes: -1, since: now };
    this.received = { bytes: -1, since: now };
    this.said.clear();
    this.wasSending = true;
    this.wasReceiving = true;
  }

  sample(s: VideoSample): VideoVerdict {
    if (this.startedAt === null) this.reset(s.now);
    const moved = (w: { bytes: number; since: number }, bytes: number) => {
      if (bytes !== w.bytes) {
        w.bytes = bytes;
        w.since = s.now;
      }
    };
    moved(this.sent, s.sentBytes);
    moved(this.received, s.receivedBytes);
    if (s.now - this.startedAt! < this.graceMs) return "ok";
    // A camera turned on (here or there) starts the count for that direction when it is turned on: nothing was due while it was off.
    if (!s.sending || !this.wasSending) this.sent.since = s.now;
    if (!s.receiving || !this.wasReceiving) this.received.since = s.now;
    this.wasSending = s.sending;
    this.wasReceiving = s.receiving;
    const stalled = (dir: VideoVerdict, w: { since: number }, due: boolean): VideoVerdict | null =>
      due && s.now - w.since >= this.stallMs && !this.said.has(dir) ? dir : null;
    const verdict = stalled("send-stalled", this.sent, s.sending) ?? stalled("receive-stalled", this.received, s.receiving);
    if (!verdict) return "ok";
    this.said.add(verdict);
    return verdict;
  }
}
