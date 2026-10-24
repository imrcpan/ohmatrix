import { EngineError, type CallEndReason, type CallState, type CallsApi, type Listener, type RoomId, type Unsubscribe } from "@ohmatrix/core";
import { CallSignalling, type CallEvent, type CallInfo, type EndReason, type IceServer, type Media, type Peer } from "./callSignalling.js";
import type { Fetch } from "./devices.js";
import type { RawCallEvent, SdkClient, SdkTask } from "./sdk.js";

/**
 * What the platform gives the engine to make calls with: the WebRTC peer connection, and the microphone and camera. It is the one place
 * that touches `react-native-webrtc` (in the app), so the engine and its tests do not.
 */
export interface CallPlatform {
  newPeer(iceServers: IceServer[]): Peer;
  media: Media;
  /** The other side's and my own streams, for the screen to play: opaque to the engine. */
  streams(): { remote?: unknown; local?: unknown };
  /** Whether the sound is on the loudspeaker now, and a change to it; absent where the platform has no choice. */
  speaker?: { get(): boolean; set(on: boolean): void };
  /** Called when the streams change (the other side's picture arrives). */
  onStreams(cb: () => void): void;
  newId(): string;
}

const REASON: Record<EndReason, CallEndReason> = {
  hangup: "hangup",
  rejected: "rejected",
  cancelled: "cancelled",
  busy: "busy",
  unanswered: "unanswered",
  failed: "failed",
  no_media: "no_media",
};

/**
 * Calls between two people for the phone: the signalling is `CallSignalling`, its events come from the call-event subscription of the SDK
 * and go out with `Room.sendRaw`, and the media is the platform's. It shows the one call as a `CallState`, as the web engine does.
 */
export class RustCalls implements CallsApi {
  private readonly listeners = new Set<Listener<CallState | null>>();
  private last: CallState | null = null;
  private sub: SdkTask | null = null;
  private client: SdkClient | null = null;
  private readonly signalling: CallSignalling;
  /** Who the people of a call are: filled in when a call starts or comes in. */
  private readonly names = new Map<string, { name: string; avatar?: string }>();

  constructor(
    private readonly platform: CallPlatform | undefined,
    private readonly fetch: () => Fetch,
    private readonly profileOf: (userId: string) => Promise<{ name: string; avatar?: string }>,
    private readonly directUser: (roomId: string) => Promise<string | undefined>,
  ) {
    this.signalling = new CallSignalling(
      {
        send: (roomId, type, content) =>
          this.need().room(roomId)?.sendRaw(type, JSON.stringify(content)) ?? Promise.reject(new EngineError("not_found", "unknown room")),
        newPeer: (servers) => this.platform!.newPeer(servers),
        iceServers: () => this.turnServers(),
        media: this.platform?.media ?? { start: async () => {}, setMuted() {}, setCameraOff() {}, stop() {} },
        now: () => Date.now(),
        later: (cb, ms) => {
          const id = setTimeout(cb, ms);
          return () => clearTimeout(id);
        },
        newId: () => this.platform!.newId(),
        log: (...a) => console.log("call:", ...a),
      },
      () => this.client?.userId() ?? "",
      (info) => void this.show(info),
    );
    this.platform?.onStreams(() => this.refreshStreams());
  }

  private need(): SdkClient {
    if (!this.client) throw new EngineError("unauthorized", "not signed in");
    return this.client;
  }

  get supported(): boolean {
    return !!this.platform && !!this.client?.onCallEvents;
  }

  /** Start listening for call events once the client is there. */
  attach(client: SdkClient): void {
    this.client = client;
    this.sub?.cancel();
    this.sub = client.onCallEvents?.((e) => void this.onEvent(e)) ?? null;
  }

  detach(): void {
    this.sub?.cancel();
    this.sub = null;
    this.client = null;
    this.last = null;
    this.listeners.forEach((cb) => cb(null));
  }

  private async onEvent(e: RawCallEvent): Promise<void> {
    let content: Record<string, unknown>;
    try {
      content = JSON.parse(e.contentJson) as Record<string, unknown>;
    } catch {
      return;
    }
    const event: CallEvent = { roomId: e.roomId, type: e.type, sender: e.sender, eventId: e.eventId, ageMs: e.ageMs, content };
    // Who is calling is looked up before the screen rings, so it says a name and not an id.
    if (e.type === "m.call.invite" && e.sender !== this.client?.userId())
      this.names.set(e.sender, await this.profileOf(e.sender).catch(() => ({ name: e.sender })));
    await this.signalling.receive(event);
  }

  private async turnServers(): Promise<IceServer[]> {
    const s = this.need().session();
    const r = await this.fetch()(`${s.homeserverUrl.replace(/\/$/, "")}/_matrix/client/v3/voip/turnServer`, {
      headers: { authorization: `Bearer ${s.accessToken}` },
    });
    if (!r.ok) return [];
    const j = (await r.json()) as { uris?: string[]; username?: string; password?: string };
    return j.uris?.length ? [{ urls: j.uris, ...(j.username ? { username: j.username } : {}), ...(j.password ? { credential: j.password } : {}) }] : [];
  }

  private refreshStreams() {
    if (this.last && this.last.phase !== "ended") void this.show(this.signalling.current);
  }

  private async show(info: CallInfo | null): Promise<void> {
    if (!info) {
      this.last = null;
      this.listeners.forEach((cb) => cb(null));
      return;
    }
    let who = this.names.get(info.peer);
    if (!who) {
      who = await this.profileOf(info.peer).catch(() => ({ name: info.peer }));
      this.names.set(info.peer, who);
    }
    // A change that came while the name was being looked up is the newer one: this is what the call is now.
    const now = this.signalling.current ?? info;
    const streams = now.phase === "ended" ? {} : (this.platform?.streams() ?? {});
    const state: CallState = {
      id: now.callId,
      roomId: now.roomId,
      peer: { userId: now.peer, name: who.name, ...(who.avatar ? { avatar: who.avatar } : {}) },
      video: now.video,
      incoming: now.incoming,
      phase: now.phase === "connecting" ? "connecting" : now.phase,
      ...(now.endReason ? { endReason: REASON[now.endReason] } : {}),
      muted: now.muted,
      cameraOff: now.cameraOff,
      remoteCameraOff: !now.video || !streams.remote,
      sharing: false,
      remoteSharing: false,
      poor: now.poor,
      ...(now.videoNotice ? { videoNotice: now.videoNotice } : {}),
      ...(this.platform?.speaker ? { speaker: this.platform.speaker.get() } : {}),
      ...(now.connectedAt ? { connectedAt: now.connectedAt } : {}),
      ...(streams.remote ? { remote: streams.remote } : {}),
      ...(streams.local ? { local: streams.local } : {}),
    };
    this.last = state;
    this.listeners.forEach((cb) => cb(state));
  }

  subscribe(cb: Listener<CallState | null>): Unsubscribe {
    this.listeners.add(cb);
    cb(this.last);
    return () => void this.listeners.delete(cb);
  }

  async place(roomId: RoomId, video: boolean): Promise<void> {
    if (!this.supported) throw new EngineError("unsupported", "Calls cannot be made here");
    const peer = await this.directUser(roomId);
    if (!peer) throw new EngineError("unsupported", "Only a one-to-one chat can be called");
    try {
      await this.signalling.place(roomId, peer, video);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (m === "busy") throw new EngineError("conflict", "A call is on already");
      if (m === "no_media") throw new EngineError("forbidden", "The microphone or camera is not available");
      throw new EngineError("unknown", m);
    }
  }

  answer(video: boolean): Promise<void> {
    return this.signalling.answer(video);
  }

  hangup(): Promise<void> {
    return this.signalling.hangup();
  }

  async setMuted(muted: boolean): Promise<void> {
    this.signalling.setMuted(muted);
  }

  async setCameraOff(off: boolean): Promise<void> {
    this.signalling.setCameraOff(off);
  }

  readonly features = { speaker: true };

  async setSpeaker(on: boolean): Promise<void> {
    this.platform?.speaker?.set(on);
    this.refreshStreams();
  }

  async setSharing(): Promise<void> {
    throw new EngineError("unsupported", "Sharing the screen is not available on the phone yet");
  }

  async useDevice(): Promise<void> {}

  dismiss(): void {
    this.signalling.dismiss();
  }
}
