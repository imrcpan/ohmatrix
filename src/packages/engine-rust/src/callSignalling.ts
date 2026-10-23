/**
 * One-to-one calls over Matrix VoIP (`m.call.*`, version 1), the part that the Rust SDK leaves to the app: the SDK sends and receives the
 * events (`Room.sendRaw`, and the call-event subscription of the patched bindings), and the media goes through a WebRTC peer connection. This
 * file is the conversation between them: who invites, who answers, which candidates go where, and when it is over. It knows nothing about
 * React Native or the bindings (both are handed in), so it is run by the unit tests with a peer connection that only records.
 *
 * What it does: place a call, answer one, hang up or reject, and carry ICE candidates both ways (a call whose answer comes before its
 * candidates, or the other way round, is the usual case). What it leaves out: changing the kind of a call in the middle (voice to video),
 * sharing the screen, putting a call on hold, and several devices of the same account answering the same call (the first answer wins, the
 * others are told with `m.call.select_answer`).
 */

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
}

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

  private end(c: Live, reason: EndReason, keep: boolean) {
    if (c.info.phase === "ended") return;
    c.info.phase = "ended";
    c.info.endReason = reason;
    c.stopTimer?.();
    c.stopBatch?.();
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
      if (c && c.info.callId !== callId) {
        // Busy: another call is on. The caller is told, and nothing rings.
        await this.t.send(e.roomId, "m.call.reject", { call_id: callId, party_id: this.t.newId(), version: VERSION, reason: "user_busy" }).catch(() => {});
        return;
      }
      if (c) return; // the same invitation again
      const offer = e.content["offer"] as SessionDescription | undefined;
      if (!offer || typeof offer.sdp !== "string") return;
      const next = this.make(e.roomId, e.sender, /m=video/.test(offer.sdp), true, callId);
      next.offer = offer;
      next.remoteParty = typeof e.content["party_id"] === "string" ? (e.content["party_id"] as string) : null;
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
