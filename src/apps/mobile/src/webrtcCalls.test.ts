import { describe, expect, it } from "vitest";
import { webrtcCalls, type RtcLib, type RtcPeer, type RtcStream, type RtcTrack } from "./webrtcCalls.js";

const track = (kind: string): RtcTrack & { stopped: boolean } => {
  const t = {
    kind,
    enabled: true,
    stopped: false,
    stop() {
      t.stopped = true;
    },
  };
  return t;
};
let streamCount = 0;
const stream = (...tracks: (RtcTrack & { stopped: boolean })[]): RtcStream => ({
  id: `s${++streamCount}`,
  addTrack: (t) => void tracks.push(t as never),
  getTracks: () => tracks,
  getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
  getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
});

function lib() {
  const peers: (RtcPeer & { listeners: Record<string, ((e: never) => void)[]>; added: RtcTrack[]; closed: boolean; state: string; config: unknown })[] = [];
  const asked: { audio: unknown; video: unknown }[] = [];
  let refuse = false;
  const l: RtcLib = {
    RTCPeerConnection: class {
      listeners: Record<string, ((e: never) => void)[]> = {};
      added: RtcTrack[] = [];
      closed = false;
      state = "new";
      constructor(public config: unknown) {
        peers.push(this as never);
      }
      async createOffer() {
        return { type: "offer", sdp: "o" };
      }
      async createAnswer() {
        return { type: "answer", sdp: "a" };
      }
      async setLocalDescription() {}
      async setRemoteDescription() {}
      async addIceCandidate() {}
      addTrack(t: RtcTrack) {
        this.added.push(t);
        return {};
      }
      close() {
        this.closed = true;
      }
      addEventListener(name: string, cb: (e: never) => void) {
        (this.listeners[name] ??= []).push(cb);
      }
      get iceConnectionState() {
        return this.state;
      }
    } as never,
    MediaStream: class {
      constructor(tracks: RtcTrack[] = []) {
        return stream(...(tracks as never[]));
      }
    } as never,
    mediaDevices: {
      getUserMedia: async (c) => {
        asked.push(c);
        if (refuse) throw new Error("NotAllowedError");
        return c.video ? stream(track("audio"), track("video")) : stream(track("audio"));
      },
    },
  };
  return { l, peers, asked, refuse: () => (refuse = true) };
}

describe("the phone's WebRTC for calls", () => {
  it("loads the library only when a connection is first made, not when the platform is made", () => {
    let loaded = 0;
    const p = webrtcCalls(
      () => (loaded++, lib().l),
      () => "id",
    );
    expect(loaded).toBe(0);
    p.newPeer([]);
    p.newPeer([]);
    expect(loaded).toBe(1);
  });

  it("passes the TURN servers on, and asks for the microphone only (for a voice call) or the camera too (for a video call)", async () => {
    const h = lib();
    const p = webrtcCalls(
      () => h.l,
      () => "id",
    );
    const peer = p.newPeer([{ urls: ["turn:t:3478"], username: "u", credential: "c" }]);
    expect(h.peers[0]!.config).toMatchObject({ iceServers: [{ urls: ["turn:t:3478"], username: "u", credential: "c" }] });
    await p.media.start(peer, false);
    expect(h.asked[0]).toMatchObject({ video: false });
    expect(h.peers[0]!.added.map((t) => t.kind)).toEqual(["audio"]);
    const peer2 = p.newPeer([]);
    await p.media.start(peer2, true);
    expect(h.asked[1]!.video).toBeTruthy();
    expect(h.peers[1]!.added.map((t) => t.kind)).toEqual(["audio", "video"]);
  });

  it("puts the phone's audio in call mode while the media is on (loudspeaker for video, earpiece for voice) and back at the end", async () => {
    const h = lib();
    const log: string[] = [];
    const p = webrtcCalls(
      () => h.l,
      () => "id",
      {
        start: (speaker) => void log.push(`start:${speaker ? "speaker" : "earpiece"}`),
        setSpeaker: (on) => void log.push(`route:${on ? "speaker" : "earpiece"}`),
        stop: () => void log.push("stop"),
      },
    );
    await p.media.start(p.newPeer([]), false);
    expect(p.speaker?.get()).toBe(false);
    p.speaker?.set(true);
    expect(p.speaker?.get()).toBe(true);
    p.media.stop();
    await p.media.start(p.newPeer([]), true);
    p.media.stop();
    expect(log).toEqual(["start:earpiece", "route:speaker", "stop", "start:speaker", "stop"]);
  });

  it("rejects when the devices are refused", async () => {
    const h = lib();
    h.refuse();
    const p = webrtcCalls(
      () => h.l,
      () => "id",
    );
    await expect(p.media.start(p.newPeer([]), false)).rejects.toThrow("NotAllowedError");
  });

  it("mutes by turning the tracks off, not stopping them, and lets everything go at the end", async () => {
    const h = lib();
    const p = webrtcCalls(
      () => h.l,
      () => "id",
    );
    await p.media.start(p.newPeer([]), true);
    const tracks = h.peers[0]!.added as (RtcTrack & { stopped: boolean })[];
    p.media.setMuted(true);
    expect(tracks.find((t) => t.kind === "audio")!.enabled).toBe(false);
    expect(tracks.find((t) => t.kind === "audio")!.stopped).toBe(false);
    p.media.setMuted(false);
    expect(tracks.find((t) => t.kind === "audio")!.enabled).toBe(true);
    p.media.setCameraOff(true);
    expect(tracks.find((t) => t.kind === "video")!.enabled).toBe(false);
    p.media.stop();
    expect(tracks.every((t) => t.stopped)).toBe(true);
    expect(p.streams()).toEqual({});
  });

  it("reports the candidates and the connection as the engine's words, and the other side's stream when it arrives", () => {
    const h = lib();
    const p = webrtcCalls(
      () => h.l,
      () => "id",
    );
    let changes = 0;
    p.onStreams(() => changes++);
    const peer = p.newPeer([]);
    const got: unknown[] = [];
    const states: string[] = [];
    peer.onCandidate((c) => got.push(c));
    peer.onConnection((s) => states.push(s));
    const pc = h.peers[0]!;
    for (const f of pc.listeners["icecandidate"]!) f({ candidate: { candidate: "c1", sdpMid: "0", sdpMLineIndex: 0 } } as never);
    for (const f of pc.listeners["icecandidate"]!) f({ candidate: null } as never);
    expect(got).toEqual([{ candidate: "c1", sdpMid: "0", sdpMLineIndex: 0 }, null]);
    for (const s of ["checking", "connected", "completed", "disconnected", "failed"]) {
      pc.state = s;
      for (const f of pc.listeners["iceconnectionstatechange"]!) f({} as never);
    }
    expect(states).toEqual(["connected", "connected", "disconnected", "failed"]);
    const remote = stream(track("audio"));
    for (const f of pc.listeners["track"]!) f({ streams: [remote] } as never);
    expect(p.streams().remote).toBe(remote);
    expect(changes).toBe(1);
  });
});
