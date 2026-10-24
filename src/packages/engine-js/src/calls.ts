import { ClientEvent, type MatrixClient, type MatrixCall } from "matrix-js-sdk";
import { CallErrorCode, CallEvent, CallState as SdkCallState, CallType } from "matrix-js-sdk/lib/webrtc/call.js";
import { SDPStreamMetadataPurpose } from "matrix-js-sdk/lib/webrtc/callEventTypes.js";
import { CallFeedEvent } from "matrix-js-sdk/lib/webrtc/callFeed.js";
import { probeEncodableVideoCodecs } from "./videoProbe.js";
import { CallEventHandlerEvent } from "matrix-js-sdk/lib/webrtc/callEventHandler.js";
import {
  EngineError,
  describeVideoStats,
  orderVideoCodecs,
  readVideoProgress,
  sdpSummary,
  sdpVideoCodecs,
  VideoWatch,
  type CallDevice,
  type CallEndReason,
  type CallPhase,
  type CallState,
  type CallsApi,
  type Listener,
  type RoomId,
  type Unsubscribe,
} from "@ohmatrix/core";
import { isDirectRoom } from "./spaces.js";

/** What the call's own state says in the words of `CallPhase`. */
function phaseOf(s: SdkCallState): CallPhase {
  switch (s) {
    case SdkCallState.Connected:
      return "connected";
    case SdkCallState.Ended:
      return "ended";
    case SdkCallState.Ringing:
    case SdkCallState.InviteSent:
    case SdkCallState.Fledgling:
      return "ringing";
    default:
      return "connecting";
  }
}

/** Why a call ended, from what the SDK says, for what the screen leaves behind. */
export function endReasonOf(reason: string | undefined, mine: boolean, wasRinging: boolean, incoming: boolean): CallEndReason {
  switch (reason) {
    case CallErrorCode.UserBusy:
      return "busy";
    case CallErrorCode.InviteTimeout:
      return "unanswered";
    case CallErrorCode.NoUserMedia:
      return "no_media";
    case CallErrorCode.UserHangup:
      // Put down by the other side before it was answered: for the caller it was turned down, for the one called the caller gave up.
      if (wasRinging && !mine) return incoming ? "cancelled" : "rejected";
      return "hangup";
    case undefined:
      return "hangup";
    default:
      return "failed";
  }
}

/**
 * One-to-one calls over the SDK's `m.call.*` support. The SDK does the signalling and the peer connection; this keeps the one call that is
 * going, turns its events into `CallState`, and gives the platform's streams to the screen. A call that comes in while another is on is
 * turned away as busy.
 */
/** The video codecs this browser can send (not only receive), by name, as it says so itself: the sender's list leaves out one it has no encoder for. */
export function sendableVideoCodecs(): string[] {
  const caps = (globalThis as { RTCRtpSender?: { getCapabilities?(kind: string): { codecs: RTCRtpCodec[] } | null } }).RTCRtpSender?.getCapabilities?.("video");
  const names: string[] = [];
  for (const c of caps?.codecs ?? []) {
    const n = c.mimeType.replace(/^video\//i, "").toUpperCase();
    if (!/^(RTX|RED|ULPFEC|FLEXFEC-03)$/.test(n) && !names.includes(n)) names.push(n);
  }
  return names;
}

/** Asks the connection's video to use its codecs in this order (names); the first is what is sent once the other side agrees. */
export function applyVideoCodecOrder(pc: RTCPeerConnection, order: readonly string[]): void {
  const caps = (globalThis as { RTCRtpReceiver?: { getCapabilities?(kind: string): { codecs: RTCRtpCodec[] } | null } }).RTCRtpReceiver?.getCapabilities?.(
    "video",
  );
  if (!caps) return;
  const rank = (c: RTCRtpCodec) => {
    const i = order.indexOf(c.mimeType.replace(/^video\//i, "").toUpperCase());
    return i < 0 ? order.length : i;
  };
  const codecs = caps.codecs
    .map((c, i) => ({ c, i }))
    .sort((x, y) => rank(x.c) - rank(y.c) || x.i - y.i)
    .map((x) => x.c);
  for (const t of pc.getTransceivers()) {
    if (t.receiver.track.kind !== "video") continue;
    try {
      t.setCodecPreferences(codecs);
    } catch (e) {
      // A browser that refuses keeps the order of the offer.
      console.log("call: video codec order refused:", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    }
  }
}

/**
 * The video codecs this browser can send, found by trying (see `probeEncodableVideoCodecs`), once for the page. Until it is known, and where it
 * cannot be found out, it is the browser's own list.
 */
let encodable: { names: string[]; done: Promise<string[]> } | null = null;
export function encodableVideoCodecs(): { names: string[]; done: Promise<string[]> } {
  if (!encodable) {
    const own = sendableVideoCodecs();
    const state = { names: own, done: Promise.resolve(own) };
    state.done = probeEncodableVideoCodecs(own).then((found) => {
      state.names = found;
      console.log("call: video codecs this browser encodes:", found.join("+") || "none", "| its list:", own.join("+"));
      return found;
    });
    encodable = state;
  }
  return encodable;
}

/** The codec this connection sends its picture with now, by name, if it can be told. */
async function sendingCodec(pc: RTCPeerConnection): Promise<string | undefined> {
  const report = await pc.getStats();
  let id: string | undefined;
  report.forEach((v: Record<string, unknown>) => {
    if (v["type"] === "outbound-rtp" && (v["kind"] ?? v["mediaType"]) === "video") id = String(v["codecId"] ?? "");
  });
  const mime = id ? (report.get(id) as { mimeType?: string } | undefined)?.mimeType : undefined;
  return mime?.replace(/^video\//i, "").toUpperCase();
}

/**
 * Tells the video sender to use the first of `order` that is among the codecs already agreed on and has not failed. It needs no negotiation,
 * so the other side takes part in nothing. Not every browser can (`encodings[0].codec` is newer than the rest): false then, and the caller
 * negotiates instead.
 */
async function switchSendingCodec(pc: RTCPeerConnection, order: readonly string[], failed: ReadonlySet<string>): Promise<boolean> {
  for (const t of pc.getTransceivers()) {
    if (t.sender.track?.kind !== "video") continue;
    const params = t.sender.getParameters() as RTCRtpSendParameters & {
      codecs?: RTCRtpCodecParameters[];
      encodings: (RTCRtpEncodingParameters & { codec?: RTCRtpCodecParameters })[];
    };
    if (!params.codecs?.length || !params.encodings?.length) return false;
    const agreed = (name: string) => params.codecs!.find((c) => c.mimeType.replace(/^video\//i, "").toUpperCase() === name);
    const next = order.map((n) => ({ n, c: agreed(n) })).find((x) => x.c && !failed.has(x.n))?.c;
    if (!next) return false;
    params.encodings[0]!.codec = next;
    try {
      await t.sender.setParameters(params);
      return true;
    } catch (e) {
      console.log("call: video: the sender refused another codec:", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
      return false;
    }
  }
  return false;
}

/** How far the video of a connection has got, both ways (in frames: see `readVideoProgress`). */
async function videoBytes(pc: RTCPeerConnection): Promise<{ sent: number; received: number }> {
  const { sent, received } = readVideoProgress(await pc.getStats());
  return { sent, received };
}

/** The `<video>` elements of the page, one by one: whether they have a picture and are playing (a picture that arrives and is not shown is read from here). */
function describeVideoElements(): string {
  if (typeof document === "undefined") return "";
  return (
    [...document.querySelectorAll("video")]
      .map((v) => `${v.videoWidth}x${v.videoHeight} ready=${v.readyState} ${v.paused ? "paused" : "playing"}${v.srcObject ? "" : " no-stream"}`)
      .join(", ") || "none"
  );
}

/** One line in the app's log with what a peer connection has sent and received: whether a call carries sound and picture is read from it. */
async function traceStats(pc: RTCPeerConnection, label: string): Promise<void> {
  try {
    const rows: string[] = [];
    (await pc.getStats()).forEach((v: Record<string, unknown>) => {
      const kind = String(v["kind"] ?? v["mediaType"] ?? "");
      if (v["type"] === "outbound-rtp") rows.push(`out ${kind} bytes=${String(v["bytesSent"] ?? 0)} packets=${String(v["packetsSent"] ?? 0)}`);
      else if (v["type"] === "inbound-rtp")
        rows.push(`in ${kind} bytes=${String(v["bytesReceived"] ?? 0)} packets=${String(v["packetsReceived"] ?? 0)} lost=${String(v["packetsLost"] ?? 0)}`);
      else if (v["type"] === "candidate-pair" && v["state"] === "succeeded" && v["nominated"] === true)
        rows.push(`pair rtt=${String(v["currentRoundTripTime"] ?? "")}`);
    });
    console.log("call:", label, "local description:", sdpSummary(pc.localDescription?.sdp), "| remote description:", sdpSummary(pc.remoteDescription?.sdp));
    // Which way each of the connection's media goes, and whether a track is on its sender: a picture that does not arrive is read from here.
    for (const t of pc.getTransceivers())
      rows.push(`${t.receiver.track.kind} ${t.currentDirection ?? "-"} (wanted ${t.direction}) sender:${t.sender.track ? "track" : "none"}`);
    console.log("call:", label, rows.join(" | "));
    console.log("call:", label, describeVideoStats(await pc.getStats()), "| video elements:", describeVideoElements());
  } catch (e) {
    console.log("call:", label, "stats failed", e instanceof Error ? e.message : String(e));
  }
}

export class JsCalls implements CallsApi {
  private listeners = new Set<Listener<CallState | null>>();
  private current: { call: MatrixCall; state: CallState; wasRinging: boolean } | null = null;
  private last: CallState | null = null;
  private client: MatrixClient | null = null;
  /** Calls whose connection dropped and has not come back. */
  private poor = new Set<string>();
  /** The video of calls being watched for a codec that does not work (stopped when the call ends). */
  private videoWatches = new Map<string, ReturnType<typeof setInterval>>();
  /** What the person is told about the picture of a call that is not coming through (see `CallState.videoNotice`), by call. */
  private videoNotices = new Map<string, "switching" | "unavailable">();

  constructor(private readonly myId: () => string | undefined) {}

  readonly features = { screenShare: true, devices: true };

  get supported(): boolean {
    return !!this.client?.supportsVoip();
  }

  attach(client: MatrixClient): void {
    this.client = client;
    // The handler starts after the first sync; a call that rings before that is picked up by it too.
    client.on(CallEventHandlerEvent.Incoming as never, ((call: MatrixCall) => this.onIncoming(call)) as never);
    client.on(ClientEvent.Sync, () => void 0);
    // Found out while nobody is waiting: a call that rings has the answer ready (it takes about a second).
    if (typeof document !== "undefined") setTimeout(() => void encodableVideoCodecs(), 4000);
  }

  detach(): void {
    this.current?.call.removeAllListeners();
    this.current = null;
    this.client = null;
    this.emit(null);
  }

  subscribe(cb: Listener<CallState | null>): Unsubscribe {
    this.listeners.add(cb);
    cb(this.last);
    return () => void this.listeners.delete(cb);
  }

  async place(roomId: RoomId, video: boolean): Promise<void> {
    const c = this.client;
    if (!c || !c.supportsVoip()) throw new EngineError("unsupported", "Calls cannot be made here");
    const room = c.getRoom(roomId);
    // A chat of two: marked as a direct chat, or a room that has just the two of them (some one-to-one chats are made that way).
    if (!room || !(isDirectRoom(c, room) || room.getJoinedMemberCount() === 2)) throw new EngineError("unsupported", "Only a one-to-one chat can be called");
    if (this.current) throw new EngineError("conflict", "A call is on already");
    const call = c.createCall(roomId);
    if (!call) throw new EngineError("unsupported", "Calls cannot be made here");
    this.adopt(call, false);
    try {
      await (video ? call.placeVideoCall() : call.placeVoiceCall());
    } catch (e) {
      this.finish(call, "no_media");
      throw new EngineError("unknown", e instanceof Error ? e.message : String(e));
    }
  }

  async answer(video: boolean): Promise<void> {
    const cur = this.current;
    if (!cur || !cur.state.incoming) return;
    const want = video && cur.state.video;
    console.log(
      "call: answer, picture asked for:",
      want,
      "(the call is video:",
      cur.state.video,
      ", the other side's picture:",
      cur.call.hasRemoteUserMediaVideoTrack,
      ")",
    );
    // What this browser really encodes decides the order of the codecs of the answer: wait for it (it is started when the call rings).
    const pc = (cur.call as unknown as { peerConn?: RTCPeerConnection }).peerConn;
    if (pc && pc.signalingState === "have-remote-offer") {
      await Promise.race([encodableVideoCodecs().done, new Promise((r) => setTimeout(r, 3000))]);
      this.orderVideoFor(pc);
    }
    await cur.call.answer(true, want);
  }

  async hangup(): Promise<void> {
    const cur = this.current;
    if (!cur) return;
    if (cur.state.incoming && cur.call.state === SdkCallState.Ringing) cur.call.reject();
    else cur.call.hangup(CallErrorCode.UserHangup, false);
    this.finish(cur.call, "hangup");
  }

  async setMuted(muted: boolean): Promise<void> {
    await this.current?.call.setMicrophoneMuted(muted);
    this.refresh();
  }

  async setCameraOff(off: boolean): Promise<void> {
    await this.current?.call.setLocalVideoMuted(off);
    this.refresh();
  }

  async setSharing(on: boolean): Promise<void> {
    const cur = this.current;
    if (!cur) return;
    const md = (globalThis as { navigator?: { mediaDevices?: { getDisplayMedia?: unknown } } }).navigator?.mediaDevices;
    if (on && !md?.getDisplayMedia) throw new EngineError("unsupported", "This browser cannot share the screen");
    try {
      await cur.call.setScreensharingEnabled(on);
    } catch (e) {
      // The person closed the browser's chooser: nothing is shared, and that is not an error.
      if (e instanceof Error && e.name === "NotAllowedError") return;
      throw new EngineError("unknown", e instanceof Error ? e.message : String(e));
    }
    this.refresh();
  }

  async devices(): Promise<{ microphones: CallDevice[]; cameras: CallDevice[] }> {
    const md = (globalThis as { navigator?: { mediaDevices?: MediaDevices } }).navigator?.mediaDevices;
    if (!md?.enumerateDevices) return { microphones: [], cameras: [] };
    const all = await md.enumerateDevices();
    const handler = this.client?.getMediaHandler() as unknown as { audioInput?: string; videoInput?: string } | undefined;
    const pick = (kind: MediaDeviceKind, used: string | undefined): CallDevice[] => {
      const list = all.filter((d) => d.kind === kind);
      return list.map((d, i) => ({
        id: d.deviceId,
        label: d.label || `${kind === "audioinput" ? "Microphone" : "Camera"} ${i + 1}`,
        current: used ? d.deviceId === used : d.deviceId === "default" || i === 0,
      }));
    };
    return { microphones: pick("audioinput", handler?.audioInput), cameras: pick("videoinput", handler?.videoInput) };
  }

  async useDevice(kind: "microphone" | "camera", id: string): Promise<void> {
    const handler = this.client?.getMediaHandler();
    if (!handler) return;
    await (kind === "microphone" ? handler.setAudioInput(id) : handler.setVideoInput(id));
    this.refresh();
  }

  dismiss(): void {
    if (this.current?.state.phase === "ended") {
      this.current = null;
      this.emit(null);
    }
  }

  private onIncoming(call: MatrixCall): void {
    // One call at a time: a second one is turned away without ringing.
    if (this.current && this.current.state.phase !== "ended") {
      console.log("call: busy, turning away", call.callId, "(on:", this.current.state.id, this.current.state.phase, ")");
      call.reject();
      return;
    }
    // A call from my own other device is not for me to take.
    if (call.getOpponentMember()?.userId === this.myId()) return;
    this.adopt(call, true);
  }

  private adopt(call: MatrixCall, incoming: boolean): void {
    const state = this.stateOf(call, incoming);
    this.current = { call, state, wasRinging: true };
    const update = () => this.refresh();
    // A feed tells of the other side's camera going off or on by itself (no call event), so each feed that comes is listened to.
    const watched = new WeakSet<object>();
    const watchFeeds = () => {
      for (const feed of call.getFeeds()) {
        if (watched.has(feed)) continue;
        watched.add(feed);
        feed.on(CallFeedEvent.MuteStateChanged as never, update as never);
        feed.on(CallFeedEvent.NewStream as never, update as never);
        if (feed.isLocal()) {
          for (const track of feed.stream.getTracks()) {
            for (const name of ["ended", "mute", "unmute"] as const)
              track.addEventListener(name, () => console.log("call: my", track.kind, "track", name, `(${track.label || "no label"}, ${track.readyState})`));
          }
        }
      }
      update();
    };
    call.on(CallEvent.State, ((state: string) => console.log("call: state:", state)) as never);
    call.on(CallEvent.FeedsChanged, ((feeds: { purpose: string; isLocal(): boolean; stream: MediaStream }[]) =>
      console.log(
        "call: feeds:",
        feeds
          .map(
            (f) =>
              `${f.isLocal() ? "local" : "remote"} ${f.purpose} tracks=${
                f.stream
                  .getTracks()
                  .map((t) => t.kind)
                  .join("+") || "none"
              }`,
          )
          .join(" | "),
      )) as never);
    call.on(CallEvent.State, update as never);
    call.on(CallEvent.FeedsChanged, watchFeeds as never);
    call.on(CallEvent.LocalHoldUnhold, update as never);
    call.on(CallEvent.Error, (() => this.finish(call, "failed")) as never);
    // The connection dropped: say so on the screen while the SDK tries to bring it back (it hangs up itself if it cannot).
    const watchConnection = (pc: RTCPeerConnection) => {
      pc.addEventListener("iceconnectionstatechange", () => {
        console.log("call: ice:", pc.iceConnectionState);
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          for (const ms of [3000, 8000, 15000]) setTimeout(() => void traceStats(pc, `stats@${ms / 1000}s`), ms);
          this.watchVideo(call, pc);
        }
        const bad = pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed";
        if (bad) this.poor.add(call.callId);
        else this.poor.delete(call.callId);
        this.refresh();
      });
    };
    call.on(CallEvent.PeerConnectionCreated as never, watchConnection as never);
    // An incoming call has made its connection before it is adopted (the SDK sets it up, then announces the call), so its event has gone by.
    const existing = (call as unknown as { peerConn?: RTCPeerConnection }).peerConn;
    if (existing) {
      watchConnection(existing);
      this.orderVideoFor(existing);
    }
    call.on(CallEvent.Hangup, (() =>
      this.finish(call, endReasonOf(call.hangupReason, call.hangupParty === "local", this.current?.wasRinging ?? false, incoming))) as never);
    this.emit(state);
  }

  /**
   * The video codecs for an incoming call, once its offer is set and before it is answered: what the caller listed, in its order, with what
   * this browser cannot send behind what it can (an answer sends with its first codec, so that must be one that can be sent).
   */
  private orderVideoFor(pc: RTCPeerConnection): void {
    const offered = sdpVideoCodecs(pc.remoteDescription?.sdp);
    const sendable = encodableVideoCodecs().names;
    const order = orderVideoCodecs({ offered, sendable, failed: [] });
    console.log(
      "call: video codecs offered:",
      offered.join("+") || "none",
      "| can send:",
      sendable.join("+") || "unknown",
      "| asked in the order:",
      order.join("+"),
    );
    applyVideoCodecOrder(pc, order);
  }

  /**
   * Watches the picture of a connected call: a camera that is on and a picture that does not move for some seconds is a codec that does not
   * work here (listed, but no working encoder) or there. The codec is put last, each is tried once, and the picture is moved to the next:
   * for what is sent, by telling the sender to use another of the codecs already agreed on (no negotiation, so nothing is needed from the
   * other side), and where the browser cannot do that, or for what should arrive, by negotiating the call again with the next codec first.
   * A negotiation that is not answered is taken back, and that ends the watching. Works for a call with anyone, not only one with this app.
   */
  private watchVideo(call: MatrixCall, pc: RTCPeerConnection): void {
    if (this.videoWatches.has(call.callId)) return;
    const watch = new VideoWatch();
    const failed = new Set<string>();
    let busy = false;
    let waitingSince = 0;
    /** After a codec was changed: what the picture that was missing has moved so far, to see it move again. */
    let waitingFor: { dir: "sent" | "received"; bytes: number } | null = null;
    const tell = (n: "switching" | "unavailable" | null) => {
      if (n) this.videoNotices.set(call.callId, n);
      else this.videoNotices.delete(call.callId);
      this.refresh();
    };
    const stop = () => {
      const t = this.videoWatches.get(call.callId);
      if (t) clearInterval(t);
      this.videoWatches.delete(call.callId);
    };
    call.on(CallEvent.Hangup, (() => this.videoNotices.delete(call.callId)) as never);
    const tick = async () => {
      if (busy) return;
      busy = true;
      try {
        if (call.state === SdkCallState.Ended || pc.signalingState === "closed") return stop();
        // An offer of ours is out and has no answer: give it time, then take it back and stop (a second one would meet the same).
        if (pc.signalingState !== "stable") {
          waitingSince ||= Date.now();
          if (Date.now() - waitingSince > 12_000) {
            console.log("call: video: the new negotiation was not answered, taking it back");
            await pc.setLocalDescription({ type: "rollback" }).catch(() => {});
            tell("unavailable");
            return stop();
          }
          return;
        }
        waitingSince = 0;
        const remote = call.getRemoteFeeds().find((f) => f.purpose === SDPStreamMetadataPurpose.Usermedia);
        const { sent, received } = await videoBytes(pc);
        // The picture that was missing moves again: the person is told no more.
        if (waitingFor && (waitingFor.dir === "sent" ? sent : received) > waitingFor.bytes && this.videoNotices.get(call.callId) === "switching") {
          waitingFor = null;
          tell(null);
        }
        const verdict = watch.sample({
          now: Date.now(),
          sentBytes: sent,
          receivedBytes: received,
          sending: call.hasLocalUserMediaVideoTrack && !call.isLocalVideoMuted(),
          receiving: call.hasRemoteUserMediaVideoTrack && !!remote && !remote.isVideoMuted(),
        });
        if (verdict === "ok") return;
        // The codec in use is the first of the answer, whichever side made it.
        const answer = pc.localDescription?.type === "answer" ? pc.localDescription : pc.remoteDescription;
        const inUse = (verdict === "send-stalled" ? await sendingCodec(pc) : undefined) ?? sdpVideoCodecs(answer?.sdp)[0];
        if (inUse) failed.add(inUse);
        const known = sdpVideoCodecs(pc.remoteDescription?.sdp);
        const order = orderVideoCodecs({ offered: known, sendable: encodableVideoCodecs().names, failed: [...failed] });
        console.log("call: video", verdict, "with", inUse ?? "?", "| asking for", order.join("+"));
        // What the encoder and decoder were doing when the picture stopped: an encoder with no frames, a decoder with frames missing.
        console.log("call: video at the stall:", describeVideoStats(await pc.getStats()));
        if (!order[0] || order[0] === inUse || failed.has(order[0])) {
          console.log("call: video: no other codec to try");
          tell("unavailable");
          return stop();
        }
        tell("switching");
        waitingFor = { dir: verdict === "send-stalled" ? "sent" : "received", bytes: verdict === "send-stalled" ? sent : received };
        if (verdict === "send-stalled" && (await switchSendingCodec(pc, order, failed))) {
          console.log("call: video: sending with another codec of the ones agreed on, without negotiating");
        } else {
          applyVideoCodecOrder(pc, order);
          // A new negotiation makes the offer with the new order (the SDK listens for this event and does the rest).
          pc.dispatchEvent(new Event("negotiationneeded"));
        }
        watch.reset(Date.now());
      } catch (e) {
        console.log("call: video watch failed:", e instanceof Error ? e.message : String(e));
      } finally {
        busy = false;
      }
    };
    this.videoWatches.set(
      call.callId,
      setInterval(() => void tick(), 1000),
    );
    call.on(CallEvent.Hangup, stop as never);
  }

  private stateOf(call: MatrixCall, incoming: boolean): CallState {
    // The other side: what the call knows once it has an answer, and before that the other person of the one-to-one room (a call I place has
    // no opponent yet, but the screen already says who is being called).
    const room = this.client?.getRoom(call.roomId);
    const me = this.myId();
    const opponent =
      call.getOpponentMember() ??
      room?.getJoinedMembers().find((m) => m.userId !== me) ??
      room?.getMembers().find((m) => m.userId !== me && m.membership === "invite");
    const userId = opponent?.userId ?? "";
    const prev = this.current?.call === call ? this.current.state : undefined;
    // The other side's screen, when it shows one, is what is on show; its camera is its other feed.
    const remoteFeeds = call.getRemoteFeeds();
    const screen = remoteFeeds.find((f) => f.purpose === SDPStreamMetadataPurpose.Screenshare);
    const camera = remoteFeeds.find((f) => f.purpose === SDPStreamMetadataPurpose.Usermedia) ?? remoteFeeds[0];
    const remote = (screen ?? camera)?.stream;
    const local = call.getLocalFeeds().find((f) => f.purpose === SDPStreamMetadataPurpose.Usermedia)?.stream ?? call.getLocalFeeds()[0]?.stream;
    const phase = phaseOf(call.state);
    return {
      id: call.callId,
      roomId: call.roomId,
      peer: { userId, name: opponent?.name ?? userId, ...(opponent?.getMxcAvatarUrl() ? { avatar: opponent.getMxcAvatarUrl()! } : {}) },
      video: call.type === CallType.Video,
      incoming,
      phase: prev?.phase === "ended" ? "ended" : phase,
      ...(prev?.endReason ? { endReason: prev.endReason } : {}),
      muted: call.isMicrophoneMuted(),
      cameraOff: call.isLocalVideoMuted() || !call.hasLocalUserMediaVideoTrack,
      remoteCameraOff: !camera || camera.isVideoMuted() || !call.hasRemoteUserMediaVideoTrack,
      sharing: call.isScreensharing(),
      remoteSharing: !!screen,
      poor: this.poor.has(call.callId),
      ...(this.videoNotices.has(call.callId) ? { videoNotice: this.videoNotices.get(call.callId)! } : {}),
      ...((phase === "connected" ? (prev?.connectedAt ?? Date.now()) : prev?.connectedAt)
        ? { connectedAt: phase === "connected" ? (prev?.connectedAt ?? Date.now()) : prev!.connectedAt! }
        : {}),
      ...(remote ? { remote } : {}),
      ...(local ? { local } : {}),
    };
  }

  private refresh(): void {
    const cur = this.current;
    // The SDK says Ended a moment before it says Hangup (which carries why): the ending is left to `finish`, so the reason is not lost.
    if (!cur || cur.state.phase === "ended" || cur.call.state === SdkCallState.Ended) return;
    // Once it is being connected it has been picked up: it is no longer ringing (the states before that are the call getting ready).
    if (cur.call.state === SdkCallState.Connecting || cur.call.state === SdkCallState.Connected) cur.wasRinging = false;
    cur.state = this.stateOf(cur.call, cur.state.incoming);
    this.emit(cur.state);
  }

  private finish(call: MatrixCall, reason: CallEndReason): void {
    const cur = this.current;
    if (!cur || cur.call !== call || cur.state.phase === "ended") return;
    cur.state = { ...cur.state, phase: "ended", endReason: reason, remote: undefined, local: undefined } as CallState;
    delete (cur.state as { remote?: unknown }).remote;
    delete (cur.state as { local?: unknown }).local;
    this.emit(cur.state);
  }

  private emit(state: CallState | null): void {
    this.last = state;
    this.listeners.forEach((cb) => cb(state));
  }
}
