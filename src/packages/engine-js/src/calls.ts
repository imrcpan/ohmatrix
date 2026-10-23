import { ClientEvent, type MatrixClient, type MatrixCall } from "matrix-js-sdk";
import { CallErrorCode, CallEvent, CallState as SdkCallState, CallType } from "matrix-js-sdk/lib/webrtc/call.js";
import { SDPStreamMetadataPurpose } from "matrix-js-sdk/lib/webrtc/callEventTypes.js";
import { CallFeedEvent } from "matrix-js-sdk/lib/webrtc/callFeed.js";
import { CallEventHandlerEvent } from "matrix-js-sdk/lib/webrtc/callEventHandler.js";
import {
  EngineError,
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
    console.log("call:", label, rows.join(" | "));
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
    if (!room || !isDirectRoom(c, room)) throw new EngineError("unsupported", "Only a one-to-one chat can be called");
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
    await cur.call.answer(true, video && cur.state.video);
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
    call.on(
      CallEvent.PeerConnectionCreated as never,
      ((pc: RTCPeerConnection) => {
        pc.addEventListener("iceconnectionstatechange", () => {
          console.log("call: ice:", pc.iceConnectionState);
          if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
            for (const ms of [3000, 8000]) setTimeout(() => void traceStats(pc, `stats@${ms / 1000}s`), ms);
          }
          const bad = pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed";
          if (bad) this.poor.add(call.callId);
          else this.poor.delete(call.callId);
          this.refresh();
        });
      }) as never,
    );
    call.on(CallEvent.Hangup, (() =>
      this.finish(call, endReasonOf(call.hangupReason, call.hangupParty === "local", this.current?.wasRinging ?? false, incoming))) as never);
    this.emit(state);
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
