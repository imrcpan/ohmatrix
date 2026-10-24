/**
 * One-to-one calls over Matrix VoIP (`m.call.*`, version 1), the part that the Rust SDK leaves to the app: the SDK sends and receives the
 * events (`Room.sendRaw`, and the call-event subscription of the patched bindings), and the media goes through a WebRTC peer connection. This
 * file is the conversation between them: who invites, who answers, which candidates go where, and when it is over. It knows nothing about
 * React Native or the bindings (both are handed in), so it is run by the unit tests with a peer connection that only records.
 *
 * What it does: place a call, answer one, hang up or reject, and carry ICE candidates both ways (a call whose answer comes before its
 * candidates, or the other way round, is the usual case). It also negotiates again in the middle of a call (`m.call.negotiate`), both when the
 * other side asks and to change the video codec when the one in use does not work (see `watchVideo`). What it leaves out: changing the kind
 * of a call in the middle (voice to video), sharing the screen, putting a call on hold, and several devices of the same account answering the same call (the first answer wins, the
 * others are told with `m.call.select_answer`).
 */

import { orderVideoCodecs, sdpVideoCodecs, VideoWatch } from "@ohmatrix/core";

/** The protocol's version, as the other clients send it. */
const VERSION = "1";
/** How long an invitation lasts: after this the one called no longer rings, and the caller gives up. */
export const INVITE_LIFETIME_MS = 60_000;
/** An invitation that was sent this long ago (or more) is not rung for: it was found by a sync after the call was over. */
const STALE_MS = INVITE_LIFETIME_MS;
/** ICE candidates are sent together, after this wait from the first of a batch, so one event carries them all. */
const CANDIDATE_BATCH_MS = 150;

export interface SessionDescription {
  type: "offer" | "answer";
  sdp: string;
}

export interface IceCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

/** What it needs of a WebRTC peer connection: the same names as the standard, so the real one is passed as it is. */
export interface Peer {
  createOffer(): Promise<SessionDescription>;
  createAnswer(): Promise<SessionDescription>;
  setLocalDescription(d: SessionDescription): Promise<void>;
  setRemoteDescription(d: SessionDescription): Promise<void>;
  addIceCandidate(c: IceCandidate): Promise<void>;
  close(): void;
  /** Called with each candidate this side finds (and with null when it has found them all). */
  onCandidate(cb: (c: IceCandidate | null) => void): void;
  /** Called when the connection is up or has gone down. */
  onConnection(cb: (state: "connected" | "disconnected" | "failed") => void): void;
  /** The video codecs this device can send (not only receive), by name, as the device says: a codec it only decodes is not in it. */
  sendableVideoCodecs?(): string[];
  /** Ask for the video codecs in this order (names): the first is what is sent once the other side agrees. */
  setVideoCodecOrder?(order: string[]): void;
  /** The descriptions now in force (what was set last), for reading which codecs are on offer and which is in use. */
  descriptions?(): { local?: string | undefined; remote?: string | undefined };
  /** What the video's encoder and decoder were doing, in one line for the log (frames, key frames, the implementations). */
  videoDetail?(): Promise<string | undefined>;
  /** What the video has moved so far (frames, or bytes where the device gives no frame count), and the codec it is sent with if that can be told. */
  videoBytes?(): Promise<{ sent: number; received: number; sendingCodec?: string | undefined } | undefined>;
}

/** The microphone and camera, and what the other side sends. */
export interface Media {
  /** Ask for the microphone (and camera, for video) and put them on `peer`; rejects when the person (or the device) says no. */
  start(peer: Peer, video: boolean): Promise<void>;
  setMuted(muted: boolean): void;
  setCameraOff(off: boolean): void;
  /** The id of the local stream, which the other side's SDP names it by (its picture and sound arrive as that stream). */
  streamId?(): string | undefined;
  stop(): void;
}

export interface Transport {
  /** Send a call event into the room. */
  send(roomId: string, type: string, content: Record<string, unknown>): Promise<void>;
  /** A new peer connection with these ICE servers. */
  newPeer(iceServers: IceServer[]): Peer;
  /** The TURN servers the homeserver offers (empty when it offers none). */
  iceServers(): Promise<IceServer[]>;
  media: Media;
  now(): number;
  /** Call `cb` once after `ms`; returns what cancels it. */
  later(cb: () => void, ms: number): () => void;
  /** A fresh id for a call or a session. */
  newId(): string;
  /** A line for the app's log: what the conversation is doing (which event went or came), not what it carries. */
  log?(...a: unknown[]): void;
}

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export type EndReason = "hangup" | "rejected" | "cancelled" | "busy" | "unanswered" | "failed" | "no_media";

export interface CallInfo {
  callId: string;
  roomId: string;
  /** The other person's user id. */
  peer: string;
  video: boolean;
  incoming: boolean;
  phase: "ringing" | "connecting" | "connected" | "ended";
  endReason?: EndReason;
  connectedAt?: number;
  muted: boolean;
  cameraOff: boolean;
  /** The ICE connection dropped and has not come back. */
  poor: boolean;
  /** The picture is not coming through: another video codec is being tried, or none is left (see `CallState.videoNotice`). */
  videoNotice?: "switching" | "unavailable";
}

/** An event of the call kind, as the subscription delivers it. */
export interface CallEvent {
  roomId: string;
  type: string;
  sender: string;
  eventId: string;
  ageMs: number;
  content: Record<string, unknown>;
}

interface Live {
  info: CallInfo;
  peer: Peer | null;
  /** Mine: this session's id for the call (sent in each of my events, so the other side can tell my sessions apart). */
  party: string;
  /** The other side's session id, once it has answered (or, for an incoming call, from its invitation). */
  remoteParty: string | null;
  /** Candidates that came before the remote description was set (they wait for it). */
  pendingRemote: IceCandidate[];
  remoteSet: boolean;
  /** Candidates found here, waiting to be sent together. */
  outgoing: IceCandidate[];
  stopBatch: (() => void) | null;
  stopTimer: (() => void) | null;
  /** The invitation, of a call that has come in and not yet been answered. */
  offer: SessionDescription | null;
  /** The invitation's sender and its ICE servers for an incoming call, taken at answer time. */
  inviteLifetime: number;
  /** An offer of mine is out and not answered yet (a second one waits, and an offer of theirs that crosses it is settled by who is polite). */
  makingOffer: boolean;
  /** The other side said, with the call, that its camera was on (from the stream metadata it sent with its invitation or answer). */
  remoteCameraOn: boolean;
  /** The watch of the video: stops it. */
  stopWatch: (() => void) | null;
  /** Video codecs that were tried and moved no picture, by direction. */
  failedSend: Set<string>;
  failedReceive: Set<string>;
}

/** Whether the stream metadata of an event says that the other side's camera is on (a user-media stream whose video is not muted). */
function cameraOnIn(content: Record<string, unknown>): boolean {
  const meta = content["org.matrix.msc3077.sdp_stream_metadata"];
  if (!meta || typeof meta !== "object") return false;
  return Object.values(meta as Record<string, { purpose?: string; video_muted?: boolean }>).some(
    (m) => m?.purpose === "m.usermedia" && m.video_muted === false,
  );
}

/** How often the video of a connected call is looked at. */
const WATCH_MS = 1000;
/** How long an offer of mine may wait for its answer before it is given up (a second one may then be made). */
const OFFER_TIMEOUT_MS = 10_000;
/** How long the handling of a negotiation of the other side may take before it is given up. */
const NEGOTIATE_TIMEOUT_MS = 8000;
/** A picture that never came is looked for only in this time after the call was connected: a camera turned off later is not a stall. */
const FIRST_PICTURE_MS = 15_000;

/**
 * The state machine. `onChange` is told after each change, with the call as it is now (null once it is gone from the screen).
 * One call at a time: another invitation while one is on is rejected as busy.
 */
export class CallSignalling {
  private call: Live | null = null;

  constructor(
    private readonly t: Transport,
    private readonly me: () => string,
    private readonly onChange: (c: CallInfo | null) => void,
  ) {}

  get current(): CallInfo | null {
    return this.call?.info ?? null;
  }

  private emit() {
    this.onChange(this.call ? { ...this.call.info } : null);
  }

  private content(c: Live, extra: Record<string, unknown>): Record<string, unknown> {
    return { call_id: c.info.callId, party_id: c.party, version: VERSION, ...extra };
  }

  private async send(c: Live, type: string, extra: Record<string, unknown>): Promise<void> {
    this.t.log?.("send", type);
    try {
      await this.t.send(c.info.roomId, type, this.content(c, extra));
    } catch {
      // A hangup or a candidate that cannot be sent leaves nothing to do: the call goes on or ends from the other side's timeout.
    }
  }

  private wire(c: Live, peer: Peer) {
    c.peer = peer;
    peer.onCandidate((cand) => {
      if (!cand) return this.flushCandidates(c);
      c.outgoing.push(cand);
      c.stopBatch ??= this.t.later(() => this.flushCandidates(c), CANDIDATE_BATCH_MS);
    });
    peer.onConnection((s) => {
      if (this.call !== c || c.info.phase === "ended") return;
      if (s === "connected") {
        c.info.poor = false;
        if (c.info.phase !== "connected") {
          c.info.phase = "connected";
          c.info.connectedAt = this.t.now();
          c.stopTimer?.();
          c.stopTimer = null;
          this.watchVideo(c);
        }
      } else if (s === "disconnected") c.info.poor = true;
      else this.end(c, "failed", true);
      this.emit();
    });
  }

  private flushCandidates(c: Live) {
    c.stopBatch?.();
    c.stopBatch = null;
    // Sent once the other side's session is known (an answer for a call I placed): until then they wait, so none is lost.
    if (!c.outgoing.length || (!c.info.incoming && !c.remoteParty)) return;
    const candidates = c.outgoing.splice(0).map((x) => ({ candidate: x.candidate, sdpMid: x.sdpMid ?? "", sdpMLineIndex: x.sdpMLineIndex ?? 0 }));
    void this.send(c, "m.call.candidates", { candidates });
  }

  /** Call the other person of a one-to-one room. Rejects with an Error whose message is "busy" when a call is on, "no_media" when the devices are refused. */
  async place(roomId: string, peerUser: string, video: boolean): Promise<void> {
    if (this.call) throw new Error("busy");
    const c = this.make(roomId, peerUser, video, false);
    this.call = c;
    this.emit();
    const peer = this.t.newPeer(await this.t.iceServers().catch(() => []));
    this.wire(c, peer);
    try {
      await this.t.media.start(peer, video);
    } catch {
      this.end(c, "no_media", false);
      throw new Error("no_media");
    }
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await this.send(c, "m.call.invite", { lifetime: INVITE_LIFETIME_MS, offer, invitee: peerUser, ...this.streamMetadata(c) });
    // Nobody picked up in time: the call is over, and the room is told so the other side stops ringing.
    c.stopTimer = this.t.later(() => {
      if (this.call === c && c.info.phase === "ringing") {
        void this.send(c, "m.call.hangup", { reason: "invite_timeout" });
        this.end(c, "unanswered", true);
      }
    }, INVITE_LIFETIME_MS);
  }

  private make(roomId: string, peerUser: string, video: boolean, incoming: boolean, callId?: string): Live {
    return {
      info: { callId: callId ?? this.t.newId(), roomId, peer: peerUser, video, incoming, phase: "ringing", muted: false, cameraOff: !video, poor: false },
      peer: null,
      party: this.t.newId(),
      remoteParty: null,
      pendingRemote: [],
      remoteSet: false,
      outgoing: [],
      stopBatch: null,
      stopTimer: null,
      offer: null,
      inviteLifetime: INVITE_LIFETIME_MS,
      makingOffer: false,
      remoteCameraOn: false,
      stopWatch: null,
      failedSend: new Set(),
      failedReceive: new Set(),
    };
  }

  /**
   * What the other client needs to tell my streams apart (MSC3077): without it, matrix-js-sdk ignores a stream it cannot name a purpose for,
   * and shows neither picture nor sound.
   */
  private streamMetadata(c: Live): Record<string, unknown> {
    const id = this.t.media.streamId?.();
    if (!id) return {};
    return {
      "org.matrix.msc3077.sdp_stream_metadata": { [id]: { purpose: "m.usermedia", audio_muted: c.info.muted, video_muted: c.info.cameraOff } },
    };
  }

  /** Pick up the call that is ringing. */
  async answer(video: boolean): Promise<void> {
    const c = this.call;
    if (!c || !c.info.incoming || c.info.phase !== "ringing" || !c.offer) return;
    c.stopTimer?.();
    c.stopTimer = null;
    c.info.phase = "connecting";
    this.emit();
    const peer = this.t.newPeer(await this.t.iceServers().catch(() => []));
    this.wire(c, peer);
    try {
      await this.t.media.start(peer, video && c.info.video);
    } catch {
      void this.send(c, "m.call.hangup", { reason: "user_media_failed" });
      this.end(c, "no_media", false);
      return;
    }
    await peer.setRemoteDescription(c.offer);
    c.remoteSet = true;
    this.orderVideo(c, c.offer.sdp);
    for (const x of c.pendingRemote.splice(0)) await peer.addIceCandidate(x).catch(() => {});
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    await this.send(c, "m.call.answer", { answer, ...this.streamMetadata(c) });
    // The candidates found while the answer was being made go now.
    this.flushCandidates(c);
  }

  /** Put the phone down, or turn a ringing call away. */
  async hangup(): Promise<void> {
    const c = this.call;
    if (!c || c.info.phase === "ended") return;
    const ringingIn = c.info.incoming && c.info.phase === "ringing";
    await this.send(c, ringingIn ? "m.call.reject" : "m.call.hangup", ringingIn ? {} : { reason: "user_hangup" });
    this.end(c, "hangup", true);
  }

  setMuted(muted: boolean) {
    const c = this.call;
    if (!c) return;
    c.info.muted = muted;
    this.t.media.setMuted(muted);
    this.emit();
  }

  setCameraOff(off: boolean) {
    const c = this.call;
    if (!c || !c.info.video) return;
    c.info.cameraOff = off;
    this.t.media.setCameraOff(off);
    this.emit();
  }

  /** Take an ended call off the screen. */
  dismiss() {
    if (this.call?.info.phase === "ended") {
      this.call = null;
      this.emit();
    }
  }

  /**
   * Asks the peer for its video codecs in the order that suits this device: what the other side offered keeps its order, with the codecs
   * this device cannot send behind the ones it can, and the ones that were tried and moved no picture last (see `orderVideoCodecs`).
   */
  private orderVideo(c: Live, offeredSdp: string | undefined, extraFailed: readonly string[] = []): string[] | null {
    const peer = c.peer;
    if (!peer?.setVideoCodecOrder || !peer.sendableVideoCodecs) return null;
    const order = orderVideoCodecs({
      offered: sdpVideoCodecs(offeredSdp),
      sendable: peer.sendableVideoCodecs(),
      failed: [...c.failedSend, ...c.failedReceive, ...extraFailed],
    });
    if (order.length) peer.setVideoCodecOrder(order);
    this.t.log?.("video codecs, asked in the order:", order.join("+") || "none");
    return order;
  }

  /** Offer the call again, with the codecs as they are now asked for; the answer comes as an `m.call.negotiate` of the other side. */
  private async renegotiate(c: Live): Promise<void> {
    const peer = c.peer;
    if (!peer || c.makingOffer || c.info.phase !== "connected") return;
    c.makingOffer = true;
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await this.send(c, "m.call.negotiate", { description: offer, lifetime: OFFER_TIMEOUT_MS, ...this.streamMetadata(c) });
      // An answer that does not come must not shut the door on the next try.
      this.t.later(() => {
        if (this.call !== c || !c.makingOffer) return;
        // No answer to the new codec: the picture will not come, and the person is told that instead of "trying".
        c.makingOffer = false;
        if (c.info.videoNotice === "switching") this.notice(c, "unavailable");
        // The other side does not take part in this (it may not know the event): trying again would meet the same silence.
        c.stopWatch?.();
        c.stopWatch = null;
      }, OFFER_TIMEOUT_MS);
    } catch {
      c.makingOffer = false;
    }
  }

  /**
   * Watches the picture of a connected call, a second at a time. A camera that is on here and a picture that does not leave, or one that is
   * on there and never arrives, is a video codec that does not work on one of the two devices (listed, but with no working encoder). The
   * codec is put last and the call is offered again with the next one; each is tried once. A camera turned off by the other side later is
   * not looked at (this side is not told of it), only the first seconds of the call are.
   */
  private watchVideo(c: Live) {
    const peer = c.peer;
    if (c.stopWatch || !peer?.videoBytes || !peer.descriptions || !c.info.video) return;
    const watch = new VideoWatch();
    const startedAt = this.t.now();
    let everReceived = false;
    let cancel: (() => void) | null = null;
    let stopped = false;
    /** After a codec was changed: what the picture that was missing has moved so far, to see it move again. */
    let waitingFor: { dir: "sent" | "received"; bytes: number } | null = null;
    const tick = async () => {
      if (stopped || this.call !== c || c.info.phase !== "connected") return;
      try {
        // An offer of mine is out and not answered: its codec is being tried, nothing more is to be judged until it is.
        if (c.makingOffer) {
          cancel = this.t.later(() => void tick(), WATCH_MS);
          return;
        }
        const bytes = await peer.videoBytes!();
        if (bytes && !stopped) {
          if (bytes.received > 0) everReceived = true;
          // The picture that was missing is moving: the person is told no more.
          if (waitingFor && bytes[waitingFor.dir] > waitingFor.bytes && c.info.videoNotice === "switching") {
            delete c.info.videoNotice;
            waitingFor = null;
            this.emit();
          }
          const verdict = watch.sample({
            now: this.t.now(),
            sentBytes: bytes.sent,
            receivedBytes: bytes.received,
            sending: !c.info.cameraOff,
            receiving: c.remoteCameraOn && !everReceived && this.t.now() - startedAt < FIRST_PICTURE_MS,
          });
          if (verdict !== "ok") {
            const changed = await this.changeCodec(c, verdict, bytes.sendingCodec, watch);
            if (changed)
              waitingFor = { dir: verdict === "send-stalled" ? "sent" : "received", bytes: verdict === "send-stalled" ? bytes.sent : bytes.received };
          }
        }
      } catch {
        /* the connection is going away: the next look finds out */
      }
      if (!stopped) cancel = this.t.later(() => void tick(), WATCH_MS);
    };
    cancel = this.t.later(() => void tick(), WATCH_MS);
    c.stopWatch = () => {
      stopped = true;
      cancel?.();
    };
  }

  /** Tells the person (`videoNotice`), so that a black picture is not waited at in silence. */
  private notice(c: Live, n: "switching" | "unavailable" | null) {
    if (n) c.info.videoNotice = n;
    else delete c.info.videoNotice;
    this.emit();
  }

  /** Returns whether another codec was asked for (false: none was left, and the person is told so). */
  private async changeCodec(c: Live, verdict: "send-stalled" | "receive-stalled", sendingCodec: string | undefined, watch: VideoWatch): Promise<boolean> {
    const peer = c.peer!;
    const d = peer.descriptions!();
    // The codec in use is the first of the answer, whichever side made it.
    const answer = c.info.incoming ? d.local : d.remote;
    const inUse = (verdict === "send-stalled" ? sendingCodec?.toUpperCase() : undefined) ?? sdpVideoCodecs(answer)[0];
    if (inUse) (verdict === "send-stalled" ? c.failedSend : c.failedReceive).add(inUse);
    const order = this.orderVideo(c, d.remote);
    this.t.log?.("video", verdict, "with", inUse ?? "?", "| asking for", order?.join("+") ?? "none");
    // What the encoder and decoder were doing when the picture stopped: an encoder with no frames, a decoder with frames missing.
    this.t.log?.("video at the stall:", (await peer.videoDetail?.().catch(() => undefined)) ?? "no detail");
    if (!order?.length || !order[0] || order[0] === inUse || c.failedSend.has(order[0]) || c.failedReceive.has(order[0])) {
      this.t.log?.("video: no other codec to try");
      this.notice(c, "unavailable");
      return false;
    }
    this.notice(c, "switching");
    await this.renegotiate(c);
    watch.reset(this.t.now());
    return true;
  }

  /** The other side offers again (`m.call.negotiate` with an offer), or answers an offer of mine. */
  private async negotiated(c: Live, content: Record<string, unknown>): Promise<void> {
    const peer = c.peer;
    const d = content["description"] as SessionDescription | undefined;
    if (!peer || !d || typeof d.sdp !== "string" || (d.type !== "offer" && d.type !== "answer")) return;
    if (d.type === "answer") {
      if (!c.makingOffer) return;
      c.makingOffer = false;
      await peer.setRemoteDescription(d);
      return;
    }
    // Both sides offering at once: the one that is polite (the one called) gives way, the other ignores the offer that crossed its own.
    const polite = c.info.incoming;
    if (c.makingOffer && !polite) return;
    c.makingOffer = false;
    await peer.setRemoteDescription(d);
    this.orderVideo(c, d.sdp);
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    await this.send(c, "m.call.negotiate", { description: answer, lifetime: OFFER_TIMEOUT_MS, ...this.streamMetadata(c) });
  }

  private end(c: Live, reason: EndReason, keep: boolean) {
    if (c.info.phase === "ended") return;
    c.info.phase = "ended";
    c.info.endReason = reason;
    c.stopTimer?.();
    c.stopBatch?.();
    c.stopWatch?.();
    c.peer?.close();
    this.t.media.stop();
    if (this.call === c) {
      if (keep) this.emit();
      else {
        this.call = null;
        this.emit();
      }
    }
  }

  /** A call event arrived (from anyone, in any room). */
  async receive(e: CallEvent): Promise<void> {
    this.t.log?.("receive", e.type, e.sender === this.me() ? "(mine)" : "", `age=${e.ageMs}ms`);
    const callId = typeof e.content["call_id"] === "string" ? (e.content["call_id"] as string) : "";
    if (!callId) return;
    const mine = e.sender === this.me();
    const c = this.call;

    if (e.type === "m.call.invite") {
      if (mine) return; // an invitation of my own other session (or my echo) is not for me
      // An invitation for someone else, or one that has rung out before it was found.
      const invitee = e.content["invitee"];
      if (typeof invitee === "string" && invitee !== this.me()) return;
      const lifetime = Number(e.content["lifetime"]) || INVITE_LIFETIME_MS;
      if (e.ageMs >= Math.min(lifetime, STALE_MS)) return;
      // A call that has ended and is only still on the screen does not make the line busy: a new invitation takes its place.
      if (c && c.info.phase === "ended") this.call = null;
      if (this.call && this.call.info.callId !== callId) {
        // Busy: another call is on. The caller is told, and nothing rings.
        await this.t.send(e.roomId, "m.call.reject", { call_id: callId, party_id: this.t.newId(), version: VERSION, reason: "user_busy" }).catch(() => {});
        return;
      }
      if (this.call) return; // the same invitation again
      const offer = e.content["offer"] as SessionDescription | undefined;
      if (!offer || typeof offer.sdp !== "string") return;
      const next = this.make(e.roomId, e.sender, /m=video/.test(offer.sdp), true, callId);
      next.offer = offer;
      next.remoteParty = typeof e.content["party_id"] === "string" ? (e.content["party_id"] as string) : null;
      next.remoteCameraOn = cameraOnIn(e.content);
      next.inviteLifetime = lifetime;
      this.call = next;
      // The call stops ringing when its lifetime has gone by (less the time it took to arrive).
      next.stopTimer = this.t.later(
        () => {
          if (this.call === next && next.info.phase === "ringing") this.end(next, "cancelled", true);
        },
        Math.max(1000, lifetime - e.ageMs),
      );
      this.emit();
      return;
    }

    // Everything else is about the call that is on.
    if (!c || c.info.callId !== callId) return;

    if (e.type === "m.call.answer") {
      if (mine) {
        // Another session of mine answered a call I was being rung for: it is no longer mine to answer.
        if (c.info.incoming && c.info.phase === "ringing" && e.content["party_id"] !== c.party) this.end(c, "cancelled", true);
        return;
      }
      if (c.info.incoming || c.remoteParty) return; // an answer to a call I did not place, or a second answer: the first one stands
      c.remoteParty = typeof e.content["party_id"] === "string" ? (e.content["party_id"] as string) : "unknown";
      c.remoteCameraOn = cameraOnIn(e.content);
      c.stopTimer?.();
      c.stopTimer = null;
      c.info.phase = "connecting";
      const answer = e.content["answer"] as SessionDescription | undefined;
      if (!answer || !c.peer) return this.end(c, "failed", true);
      try {
        await c.peer.setRemoteDescription(answer);
        c.remoteSet = true;
        for (const x of c.pendingRemote.splice(0)) await c.peer.addIceCandidate(x).catch(() => {});
      } catch {
        this.end(c, "failed", true);
        return;
      }
      // Tell the other side which of its answers is the one used, then send what waited.
      await this.send(c, "m.call.select_answer", { selected_party_id: c.remoteParty });
      this.flushCandidates(c);
      this.emit();
      return;
    }

    if (e.type === "m.call.negotiate") {
      // Only the other side's session that is in the call, not my own echo.
      if (mine || (c.remoteParty && e.content["party_id"] !== c.remoteParty) || c.info.phase !== "connected") return;
      try {
        // A negotiation that does not finish must not hold the call: it is given a little time, and what it says is in the log.
        await Promise.race([
          this.negotiated(c, e.content),
          new Promise<never>((_, reject) => void this.t.later(() => reject(new Error("no end to it after 8 s")), NEGOTIATE_TIMEOUT_MS)),
        ]);
      } catch (err) {
        // The call goes on as it was.
        this.t.log?.("negotiation failed:", err instanceof Error ? err.message : String(err));
      }
      return;
    }

    if (e.type === "m.call.candidates") {
      if (mine) return;
      const list = (e.content["candidates"] as { candidate?: string; sdpMid?: string; sdpMLineIndex?: number }[] | undefined) ?? [];
      for (const x of list) {
        // An empty candidate is the end of them.
        if (!x.candidate) continue;
        const cand: IceCandidate = { candidate: x.candidate, sdpMid: x.sdpMid ?? null, sdpMLineIndex: x.sdpMLineIndex ?? null };
        if (c.remoteSet && c.peer) await c.peer.addIceCandidate(cand).catch(() => {});
        else c.pendingRemote.push(cand);
      }
      return;
    }

    if (e.type === "m.call.hangup" || e.type === "m.call.reject") {
      if (mine) {
        // My other session turned a ringing call away: it stops ringing here too.
        if (c.info.incoming && c.info.phase === "ringing") this.end(c, "cancelled", true);
        return;
      }
      const reason = e.content["reason"];
      const wasRinging = c.info.phase === "ringing";
      this.end(
        c,
        reason === "user_busy" ? "busy" : reason === "invite_timeout" ? "unanswered" : wasRinging ? (c.info.incoming ? "cancelled" : "rejected") : "hangup",
        true,
      );
      return;
    }
  }
}
