import type { CallPlatform, Peer } from "@ohmatrix/engine-rust";

/**
 * The phone's side of a call: `react-native-webrtc` made into the `CallPlatform` the engine takes. The library is passed in (not imported
 * here), so this file is run by the unit tests with a stand-in that only records what it is asked, and the real one is loaded only when
 * the first call is made (it is a native module, and the app starts without it).
 *
 * What it does about the devices: the microphone is asked for when a call is placed or answered (not before), the camera too for a video
 * call; muting turns the tracks off rather than stopping them (so the other side hears silence, not a dropped line), and the camera of a
 * video call can be turned off the same way. Everything is let go when the call ends.
 */

/** The parts of react-native-webrtc used here (its own types are larger; these are what this file needs). */
export interface RtcLib {
  RTCPeerConnection: new (config: { iceServers: { urls: string[]; username?: string; credential?: string }[]; bundlePolicy?: string }) => RtcPeer;
  mediaDevices: { getUserMedia(c: { audio: unknown; video: unknown }): Promise<RtcStream> };
  MediaStream: new (tracks?: RtcTrack[]) => RtcStream;
}

export interface RtcTrack {
  kind: string;
  enabled: boolean;
  stop(): void;
}

export interface RtcStream {
  id: string;
  addTrack(t: RtcTrack): void;
  getTracks(): RtcTrack[];
  getAudioTracks(): RtcTrack[];
  getVideoTracks(): RtcTrack[];
}

export interface RtcPeer {
  createOffer(): Promise<{ type: string; sdp?: string }>;
  createAnswer(): Promise<{ type: string; sdp?: string }>;
  setLocalDescription(d: { type: string; sdp?: string }): Promise<void>;
  setRemoteDescription(d: unknown): Promise<void>;
  addIceCandidate(c: unknown): Promise<void>;
  addTrack(t: RtcTrack, s: RtcStream): unknown;
  close(): void;
  addEventListener(name: string, cb: (e: never) => void): void;
  readonly iceConnectionState: string;
  /** The connection's statistics (react-native-webrtc returns a report that can be walked with `forEach`). */
  getStats?(): Promise<{ forEach(cb: (v: Record<string, unknown>) => void): void }>;
}

/** What a call writes to the app's log (Settings > Advanced options) and to logcat: the steps of the connection, not its content. */
const trace = (...a: unknown[]) => console.log("call:", ...a);

/** A few seconds into a call: how much sound and picture has gone each way, and which route the media takes. Says whether the media flows at all. */
async function traceStats(pc: RtcPeer, label: string) {
  try {
    const report = await pc.getStats?.();
    if (!report) return;
    const rows: string[] = [];
    report.forEach((v) => {
      const type = String(v["type"]);
      const kind = String(v["kind"] ?? v["mediaType"] ?? "");
      if (type === "outbound-rtp") rows.push(`out ${kind} bytes=${String(v["bytesSent"] ?? 0)} packets=${String(v["packetsSent"] ?? 0)}`);
      else if (type === "inbound-rtp")
        rows.push(`in ${kind} bytes=${String(v["bytesReceived"] ?? 0)} packets=${String(v["packetsReceived"] ?? 0)} lost=${String(v["packetsLost"] ?? 0)}`);
      else if (type === "candidate-pair" && v["state"] === "succeeded" && v["nominated"] === true)
        rows.push(`pair rtt=${String(v["currentRoundTripTime"] ?? "")} ${String(v["localCandidateId"])}->${String(v["remoteCandidateId"])}`);
      else if ((type === "local-candidate" || type === "remote-candidate") && v["candidateType"])
        rows.push(`${type === "local-candidate" ? "L" : "R"}:${String(v["id"])}=${String(v["candidateType"])}/${String(v["protocol"] ?? "")}`);
    });
    trace(label, rows.join(" | "));
  } catch (e) {
    trace(label, "stats failed", e instanceof Error ? e.message : String(e));
  }
}

/** The engine's `Peer`, which also remembers the real connection it wraps (the media is put on that one). */
type Wrapped = Peer & { readonly connection: RtcPeer };

/** The phone's audio mode for a call (modules/ohmatrix-call-audio): call mode and the route of the sound. Absent where the module is not. */
export interface CallAudio {
  start(speaker: boolean): void;
  setSpeaker(on: boolean): void;
  stop(): void;
}

export function webrtcCalls(load: () => RtcLib, newId: () => string, audio?: CallAudio): CallPlatform {
  let lib: RtcLib | null = null;
  const rtc = () => (lib ??= load());
  let local: RtcStream | null = null;
  let remote: RtcStream | null = null;
  let onSpeaker = false;
  // The engine's: told whenever the streams change (the other side's picture arrives, the camera goes off), so the screen shows it.
  let onChange: () => void = () => {};

  return {
    newId,
    newPeer(iceServers) {
      const pc = new (rtc().RTCPeerConnection)({
        iceServers: iceServers.map((s) => ({
          urls: s.urls,
          ...(s.username ? { username: s.username } : {}),
          ...(s.credential ? { credential: s.credential } : {}),
        })),
        bundlePolicy: "max-bundle",
      });
      trace("peer made; ice servers:", iceServers.map((s) => s.urls.join(",")).join(" ") || "none");
      for (const name of ["iceconnectionstatechange", "connectionstatechange", "icegatheringstatechange", "signalingstatechange"])
        pc.addEventListener(name, () => trace(name));
      pc.addEventListener("iceconnectionstatechange", () => {
        trace("ice:", pc.iceConnectionState);
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          setTimeout(() => void traceStats(pc, "stats@3s"), 3000);
          setTimeout(() => void traceStats(pc, "stats@8s"), 8000);
        }
      });
      // The other side's picture and sound: the first stream that comes.
      pc.addEventListener("track", (e: { streams?: RtcStream[]; track?: RtcTrack }) => {
        trace("track", e.track?.kind ?? "?", "streams:", e.streams?.length ?? 0);
        let s = e.streams?.[0];
        if (!s && e.track) {
          // The other side named no stream: its tracks are gathered into one of ours.
          if (!remote) remote = new (rtc().MediaStream)([e.track]);
          else remote.addTrack(e.track);
          s = remote;
          onChange();
        }
        if (s && s !== remote) {
          remote = s;
          onChange();
        }
      });
      const peer: Wrapped = {
        connection: pc,
        createOffer: async () => ({ type: "offer", sdp: (await pc.createOffer()).sdp ?? "" }),
        createAnswer: async () => ({ type: "answer", sdp: (await pc.createAnswer()).sdp ?? "" }),
        setLocalDescription: (d) => pc.setLocalDescription(d),
        setRemoteDescription: (d) => pc.setRemoteDescription(d),
        addIceCandidate: (c) => pc.addIceCandidate(c),
        close: () => pc.close(),
        onCandidate: (cb) =>
          pc.addEventListener("icecandidate", (e: { candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } | null }) =>
            cb(e.candidate ? { candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid ?? null, sdpMLineIndex: e.candidate.sdpMLineIndex ?? null } : null),
          ),
        onConnection: (cb) =>
          pc.addEventListener("iceconnectionstatechange", () => {
            const s = pc.iceConnectionState;
            if (s === "connected" || s === "completed") cb("connected");
            else if (s === "disconnected") cb("disconnected");
            else if (s === "failed") cb("failed");
          }),
      };
      return peer;
    },
    media: {
      async start(peer, video) {
        // Asked for here: the system asks the person the first time, and a refusal rejects (the call ends as "no media").
        const stream = await rtc().mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: video ? { facingMode: "user", width: 640, height: 480, frameRate: 24 } : false,
        });
        local = stream;
        trace(
          "media started:",
          stream
            .getTracks()
            .map((t) => t.kind)
            .join("+"),
        );
        // A video call comes out of the loudspeaker (the phone is held away to look at it), a voice call out of the earpiece.
        onSpeaker = video;
        audio?.start(video);
        for (const t of stream.getTracks()) (peer as Wrapped).connection.addTrack(t, stream);
        onChange();
      },
      setMuted(muted) {
        for (const t of local?.getAudioTracks() ?? []) t.enabled = !muted;
      },
      setCameraOff(off) {
        for (const t of local?.getVideoTracks() ?? []) t.enabled = !off;
        onChange();
      },
      streamId: () => local?.id,
      stop() {
        for (const t of local?.getTracks() ?? []) t.stop();
        audio?.stop();
        local = null;
        remote = null;
        onChange();
      },
    },
    ...(audio
      ? {
          speaker: {
            get: () => onSpeaker,
            set: (on: boolean) => {
              onSpeaker = on;
              audio.setSpeaker(on);
            },
          },
        }
      : {}),
    streams: () => ({ ...(remote ? { remote } : {}), ...(local ? { local } : {}) }),
    onStreams: (cb) => void (onChange = cb),
  };
}
