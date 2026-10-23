import { describe, expect, it } from "vitest";
import {
  CallSignalling,
  INVITE_LIFETIME_MS,
  type CallEvent,
  type CallInfo,
  type IceCandidate,
  type IceServer,
  type Media,
  type Peer,
  type SessionDescription,
  type Transport,
} from "./callSignalling.js";

class FakePeer implements Peer {
  log: string[] = [];
  added: IceCandidate[] = [];
  closed = false;
  private cand: (c: IceCandidate | null) => void = () => {};
  private conn: (s: "connected" | "disconnected" | "failed") => void = () => {};
  constructor(readonly sdp = "v=0 m=audio") {}
  async createOffer(): Promise<SessionDescription> {
    this.log.push("createOffer");
    return { type: "offer", sdp: this.sdp };
  }
  async createAnswer(): Promise<SessionDescription> {
    this.log.push("createAnswer");
    return { type: "answer", sdp: "answer-sdp" };
  }
  async setLocalDescription(d: SessionDescription) {
    this.log.push(`local:${d.type}`);
  }
  async setRemoteDescription(d: SessionDescription) {
    this.log.push(`remote:${d.type}`);
  }
  async addIceCandidate(c: IceCandidate) {
    this.log.push(`ice:${c.candidate}`);
    this.added.push(c);
  }
  close() {
    this.closed = true;
  }
  onCandidate(cb: (c: IceCandidate | null) => void) {
    this.cand = cb;
  }
  onConnection(cb: (s: "connected" | "disconnected" | "failed") => void) {
    this.conn = cb;
  }
  found(candidate: string) {
    this.cand({ candidate, sdpMid: "0", sdpMLineIndex: 0 });
  }
  up(s: "connected" | "disconnected" | "failed") {
    this.conn(s);
  }
}

function setup(opts: { me?: string; refuseMedia?: boolean } = {}) {
  const sent: { roomId: string; type: string; content: Record<string, unknown> }[] = [];
  const peers: FakePeer[] = [];
  const timers: { cb: () => void; ms: number; live: boolean }[] = [];
  const states: (CallInfo | null)[] = [];
  let id = 0;
  let clock = 1_000_000;
  const mediaLog: string[] = [];
  const media: Media = {
    start: async (_p, video) => {
      if (opts.refuseMedia) throw new Error("denied");
      mediaLog.push(video ? "start:video" : "start:audio");
    },
    setMuted: (m) => void mediaLog.push(`mute:${m}`),
    setCameraOff: (o) => void mediaLog.push(`camoff:${o}`),
    stop: () => void mediaLog.push("stop"),
  };
  const t: Transport = {
    send: async (roomId, type, content) => void sent.push({ roomId, type, content }),
    newPeer: (_s: IceServer[]) => {
      const p = new FakePeer(peers.length === 0 && wantVideo ? "v=0 m=audio m=video" : "v=0 m=audio");
      peers.push(p);
      return p;
    },
    iceServers: async () => [],
    media,
    now: () => clock,
    later: (cb, ms) => {
      const x = { cb, ms, live: true };
      timers.push(x);
      return () => void (x.live = false);
    },
    newId: () => `id${++id}`,
  };
  let wantVideo = false;
  const s = new CallSignalling(
    t,
    () => opts.me ?? "@me:s",
    (c) => void states.push(c),
  );
  return {
    s,
    sent,
    peers,
    states,
    mediaLog,
    timers,
    tick: (ms: number) => {
      clock += ms;
      for (const x of timers.filter((x) => x.live && x.ms <= ms)) {
        x.live = false;
        x.cb();
      }
    },
    last: () => states[states.length - 1],
    video: () => void (wantVideo = true),
  };
}

const ev = (type: string, content: Record<string, unknown>, over: Partial<CallEvent> = {}): CallEvent => ({
  roomId: "!r:s",
  type,
  sender: "@you:s",
  eventId: "$e",
  ageMs: 0,
  content,
  ...over,
});

describe("placing a call", () => {
  it("asks for the microphone, sends the invitation with the offer, and rings until it is answered", async () => {
    const h = setup();
    await h.s.place("!r:s", "@you:s", false);
    expect(h.mediaLog).toEqual(["start:audio"]);
    const invite = h.sent.find((x) => x.type === "m.call.invite")!;
    expect(invite.content).toMatchObject({ version: "1", invitee: "@you:s", lifetime: INVITE_LIFETIME_MS, offer: { type: "offer" } });
    expect(invite.content["call_id"]).toBeTruthy();
    expect(invite.content["party_id"]).toBeTruthy();
    expect(h.last()).toMatchObject({ phase: "ringing", incoming: false, peer: "@you:s", video: false });
  });

  it("is refused while another call is on, and ends at once with no_media when the devices are refused", async () => {
    const a = setup();
    await a.s.place("!r:s", "@you:s", false);
    await expect(a.s.place("!r:s", "@you:s", false)).rejects.toThrow("busy");
    const b = setup({ refuseMedia: true });
    await expect(b.s.place("!r:s", "@you:s", false)).rejects.toThrow("no_media");
    expect(b.s.current).toBeNull();
  });

  it("rings out after the invitation's lifetime: a hangup goes to the room, and the call ends as unanswered", async () => {
    const h = setup();
    await h.s.place("!r:s", "@you:s", false);
    h.tick(INVITE_LIFETIME_MS);
    expect(h.sent.at(-1)).toMatchObject({ type: "m.call.hangup", content: { reason: "invite_timeout" } });
    expect(h.last()).toMatchObject({ phase: "ended", endReason: "unanswered" });
  });

  it("goes on when the answer comes: sets it, selects it, and sends the candidates that were waiting for it", async () => {
    const h = setup();
    await h.s.place("!r:s", "@you:s", false);
    const callId = h.sent[0]!.content["call_id"];
    h.peers[0]!.found("c1");
    h.peers[0]!.found("c2");
    h.tick(150);
    // The other side has not answered: nothing of the candidates goes yet.
    expect(h.sent.some((x) => x.type === "m.call.candidates")).toBe(false);
    await h.s.receive(ev("m.call.answer", { call_id: callId, party_id: "theirs", answer: { type: "answer", sdp: "a" } }));
    expect(h.peers[0]!.log).toContain("remote:answer");
    expect(h.sent.find((x) => x.type === "m.call.select_answer")!.content["selected_party_id"]).toBe("theirs");
    const cands = h.sent.find((x) => x.type === "m.call.candidates")!;
    expect(cands.content["candidates"]).toHaveLength(2);
    expect(h.last()).toMatchObject({ phase: "connecting" });
    h.peers[0]!.up("connected");
    expect(h.last()).toMatchObject({ phase: "connected", poor: false });
    expect(h.last()!.connectedAt).toBeGreaterThan(0);
  });

  it("takes the first answer only", async () => {
    const h = setup();
    await h.s.place("!r:s", "@you:s", false);
    const callId = h.sent[0]!.content["call_id"];
    await h.s.receive(ev("m.call.answer", { call_id: callId, party_id: "first", answer: { type: "answer", sdp: "a" } }));
    await h.s.receive(ev("m.call.answer", { call_id: callId, party_id: "second", answer: { type: "answer", sdp: "b" } }));
    expect(h.peers[0]!.log.filter((x) => x === "remote:answer")).toHaveLength(1);
    expect(h.sent.filter((x) => x.type === "m.call.select_answer")).toHaveLength(1);
  });

  it("is turned down: a reject while ringing ends it as rejected; a busy reject as busy", async () => {
    const a = setup();
    await a.s.place("!r:s", "@you:s", false);
    await a.s.receive(ev("m.call.reject", { call_id: a.sent[0]!.content["call_id"] }));
    expect(a.last()).toMatchObject({ phase: "ended", endReason: "rejected" });
    const b = setup();
    await b.s.place("!r:s", "@you:s", false);
    await b.s.receive(ev("m.call.reject", { call_id: b.sent[0]!.content["call_id"], reason: "user_busy" }));
    expect(b.last()).toMatchObject({ endReason: "busy" });
  });
});

describe("a call that comes in", () => {
  const invite = (over: Partial<CallEvent> = {}, content: Record<string, unknown> = {}) =>
    ev(
      "m.call.invite",
      { call_id: "call1", party_id: "theirs", version: "1", lifetime: 60_000, offer: { type: "offer", sdp: "v=0 m=audio" }, invitee: "@me:s", ...content },
      over,
    );

  it("rings with who is calling and whether it is a video call", async () => {
    const h = setup();
    await h.s.receive(invite({}, { offer: { type: "offer", sdp: "v=0 m=audio m=video" } }));
    expect(h.last()).toMatchObject({ phase: "ringing", incoming: true, peer: "@you:s", video: true, callId: "call1" });
  });

  it("does not ring for an invitation of mine, for someone else, or one that has rung out before it was found", async () => {
    const h = setup();
    await h.s.receive(invite({ sender: "@me:s" }));
    await h.s.receive(invite({}, { invitee: "@other:s" }));
    await h.s.receive(invite({ ageMs: 61_000 }));
    expect(h.states).toHaveLength(0);
  });

  it("turns a second call away as busy, and the first goes on", async () => {
    const h = setup();
    await h.s.receive(invite());
    await h.s.receive(invite({}, { call_id: "call2" }));
    expect(h.sent.at(-1)).toMatchObject({ type: "m.call.reject", content: { call_id: "call2", reason: "user_busy" } });
    expect(h.s.current?.callId).toBe("call1");
  });

  it("answers: media first, the offer set, the answer sent, and the candidates that came early added after the offer", async () => {
    const h = setup();
    await h.s.receive(invite());
    await h.s.receive(
      ev("m.call.candidates", { call_id: "call1", party_id: "theirs", candidates: [{ candidate: "early", sdpMid: "0", sdpMLineIndex: 0 }, { candidate: "" }] }),
    );
    await h.s.answer(false);
    const log = h.peers[0]!.log;
    expect(log.indexOf("remote:offer")).toBeLessThan(log.indexOf("ice:early"));
    expect(log.indexOf("ice:early")).toBeLessThan(log.indexOf("createAnswer"));
    expect(h.sent.find((x) => x.type === "m.call.answer")!.content).toMatchObject({ call_id: "call1", answer: { type: "answer" } });
    // Candidates after the offer is set go straight in.
    await h.s.receive(ev("m.call.candidates", { call_id: "call1", candidates: [{ candidate: "late", sdpMid: "0", sdpMLineIndex: 0 }] }));
    expect(h.peers[0]!.log).toContain("ice:late");
    h.peers[0]!.found("mine");
    h.tick(150);
    expect(h.sent.at(-1)).toMatchObject({ type: "m.call.candidates" });
  });

  it("is rejected when turned away while ringing, and hung up when put down on a call that is on", async () => {
    const a = setup();
    await a.s.receive(invite());
    await a.s.hangup();
    expect(a.sent.at(-1)!.type).toBe("m.call.reject");
    expect(a.last()).toMatchObject({ phase: "ended", endReason: "hangup" });
    const b = setup();
    await b.s.receive(invite());
    await b.s.answer(false);
    await b.s.hangup();
    expect(b.sent.at(-1)).toMatchObject({ type: "m.call.hangup", content: { reason: "user_hangup" } });
    expect(b.peers[0]!.closed).toBe(true);
    expect(b.mediaLog).toContain("stop");
  });

  it("stops ringing when the caller gives up, or when my other session answers or turns it away", async () => {
    const a = setup();
    await a.s.receive(invite());
    await a.s.receive(ev("m.call.hangup", { call_id: "call1" }));
    expect(a.last()).toMatchObject({ phase: "ended", endReason: "cancelled" });
    const b = setup();
    await b.s.receive(invite());
    await b.s.receive(ev("m.call.answer", { call_id: "call1", party_id: "my-other-session" }, { sender: "@me:s" }));
    expect(b.last()).toMatchObject({ phase: "ended", endReason: "cancelled" });
    const c = setup();
    await c.s.receive(invite());
    await c.s.receive(ev("m.call.reject", { call_id: "call1" }, { sender: "@me:s" }));
    expect(c.last()).toMatchObject({ phase: "ended" });
  });

  it("stops ringing by itself when the invitation's lifetime has gone, counted from when it was sent", async () => {
    const h = setup();
    await h.s.receive(invite({ ageMs: 20_000 }));
    expect(h.timers.find((x) => x.live)!.ms).toBe(40_000);
    h.tick(40_000);
    expect(h.last()).toMatchObject({ phase: "ended", endReason: "cancelled" });
  });

  it("fails the call, with the devices let go, when the connection fails; marks it poor while it is only down", async () => {
    const h = setup();
    await h.s.receive(invite());
    await h.s.answer(false);
    h.peers[0]!.up("connected");
    h.peers[0]!.up("disconnected");
    expect(h.last()).toMatchObject({ phase: "connected", poor: true });
    h.peers[0]!.up("connected");
    expect(h.last()).toMatchObject({ poor: false });
    h.peers[0]!.up("failed");
    expect(h.last()).toMatchObject({ phase: "ended", endReason: "failed" });
    expect(h.mediaLog).toContain("stop");
  });
});

describe("during a call", () => {
  it("ignores events of other calls, mute and camera go to the devices, and an ended call stays until it is dismissed", async () => {
    const h = setup();
    h.video();
    await h.s.place("!r:s", "@you:s", true);
    const callId = h.sent[0]!.content["call_id"];
    await h.s.receive(ev("m.call.hangup", { call_id: "someone-else" }));
    expect(h.last()!.phase).toBe("ringing");
    h.s.setMuted(true);
    h.s.setCameraOff(true);
    expect(h.mediaLog).toEqual(expect.arrayContaining(["mute:true", "camoff:true"]));
    expect(h.last()).toMatchObject({ muted: true, cameraOff: true });
    await h.s.receive(ev("m.call.hangup", { call_id: callId }));
    expect(h.last()).toMatchObject({ phase: "ended" });
    h.s.dismiss();
    expect(h.last()).toBeNull();
  });
});
