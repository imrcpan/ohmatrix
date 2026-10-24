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
  /** The video abilities (set by `setup({ videoPeer })`): what it can send, the orders asked for, the descriptions in force and what moved. */
  orders: string[][] = [];
  local: string | undefined;
  remote: string | undefined;
  bytes: { sent: number; received: number; sendingCodec?: string } = { sent: 0, received: 0 };
  sendableVideoCodecs?: () => string[];
  setVideoCodecOrder?: (order: string[]) => void;
  descriptions?: () => { local?: string | undefined; remote?: string | undefined };
  videoBytes?: () => Promise<{ sent: number; received: number; sendingCodec?: string | undefined } | undefined>;
  constructor(
    readonly sdp = "v=0 m=audio",
    video?: { sendable: string[] },
  ) {
    if (!video) return;
    this.sendableVideoCodecs = () => video.sendable;
    this.setVideoCodecOrder = (order) => {
      this.orders.push(order);
      this.log.push(`order:${order.join("+")}`);
    };
    this.descriptions = () => ({ local: this.local, remote: this.remote });
    this.videoBytes = async () => ({ ...this.bytes });
  }
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

function setup(opts: { me?: string; refuseMedia?: boolean; videoPeer?: { sendable: string[] } } = {}) {
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
      const p = new FakePeer(peers.length === 0 && wantVideo ? "v=0 m=audio m=video" : "v=0 m=audio", opts.videoPeer);
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

/** A description with an audio section and a video section that lists these codecs, in this order (a payload type for each). */
const sdpWith = (...codecs: string[]) =>
  [
    "v=0",
    "m=audio 9 UDP/TLS/RTP/SAVPF 111",
    "a=rtpmap:111 opus/48000/2",
    `m=video 9 UDP/TLS/RTP/SAVPF ${codecs.map((_, i) => 96 + i).join(" ")}`,
    ...codecs.map((c, i) => `a=rtpmap:${96 + i} ${c}/90000`),
    "",
  ].join("\r\n");

/** Lets the watch's look (which waits for the statistics) finish before the next second. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
async function seconds(h: ReturnType<typeof setup>, n: number) {
  for (let i = 0; i < n; i++) {
    h.tick(1000);
    await flush();
  }
}

/** A video call that I placed and the other side answered with `answerCodecs` (the first is what each side sends), and which is up. */
async function upVideoCall(h: ReturnType<typeof setup>, answerCodecs: string[], meta: Record<string, unknown> = {}) {
  h.video();
  await h.s.place("!r:s", "@you:s", true);
  const callId = h.sent[0]!.content["call_id"];
  const peer = h.peers[0]!;
  await h.s.receive(ev("m.call.answer", { call_id: callId, party_id: "theirs", answer: { type: "answer", sdp: sdpWith(...answerCodecs) }, ...meta }));
  peer.local = sdpWith(...answerCodecs);
  peer.remote = sdpWith(...answerCodecs);
  peer.up("connected");
  return { callId, peer };
}
const cameraOn = { "org.matrix.msc3077.sdp_stream_metadata": { s: { purpose: "m.usermedia", audio_muted: false, video_muted: false } } };

describe("the video codecs of an incoming call", () => {
  it("are asked for in the order the other side offered them, with what this device cannot send behind what it can, before the answer is made", async () => {
    const h = setup({ videoPeer: { sendable: ["VP8", "VP9"] } });
    await h.s.receive(
      ev("m.call.invite", { call_id: "c1", party_id: "theirs", lifetime: 60000, offer: { type: "offer", sdp: sdpWith("H264", "VP8", "VP9") } }),
    );
    await h.s.answer(true);
    expect(h.peers[0]!.orders).toEqual([["VP8", "VP9", "H264"]]);
    const log = h.peers[0]!.log;
    expect(log.indexOf("order:VP8+VP9+H264")).toBeGreaterThan(log.indexOf("remote:offer"));
    expect(log.indexOf("order:VP8+VP9+H264")).toBeLessThan(log.indexOf("createAnswer"));
  });

  it("keep the offer's order when the device can send them all (a phone offers H264 first, and a phone can send it)", async () => {
    const h = setup({ videoPeer: { sendable: ["VP8", "H264", "VP9"] } });
    await h.s.receive(
      ev("m.call.invite", { call_id: "c1", party_id: "theirs", lifetime: 60000, offer: { type: "offer", sdp: sdpWith("H264", "VP8", "VP9") } }),
    );
    await h.s.answer(true);
    expect(h.peers[0]!.orders).toEqual([["H264", "VP8", "VP9"]]);
  });

  it("are left as they come by a peer that cannot tell what it sends", async () => {
    const h = setup();
    await h.s.receive(ev("m.call.invite", { call_id: "c1", party_id: "theirs", lifetime: 60000, offer: { type: "offer", sdp: sdpWith("H264", "VP8") } }));
    await h.s.answer(true);
    expect(h.peers[0]!.log.some((l) => l.startsWith("order:"))).toBe(false);
  });
});

describe("negotiating again in the middle of a call (m.call.negotiate)", () => {
  it("answers an offer of the other side: sets it, asks for the codecs, answers with a negotiate event", async () => {
    const h = setup({ videoPeer: { sendable: ["VP8", "H264"] } });
    const { callId, peer } = await upVideoCall(h, ["H264", "VP8"]);
    const before = h.sent.length;
    await h.s.receive(ev("m.call.negotiate", { call_id: callId, party_id: "theirs", description: { type: "offer", sdp: sdpWith("VP8", "H264") } }));
    expect(peer.log.slice(-4)).toEqual(["remote:offer", "order:VP8+H264", "createAnswer", "local:answer"]);
    const sent = h.sent.slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.type).toBe("m.call.negotiate");
    expect(sent[0]!.content["description"]).toEqual({ type: "answer", sdp: "answer-sdp" });
    expect(sent[0]!.content["call_id"]).toBe(callId);
  });

  it("takes the answer to an offer of its own, and ignores an answer to none", async () => {
    const h = setup({ videoPeer: { sendable: ["VP8", "H264"] } });
    const { callId, peer } = await upVideoCall(h, ["H264", "VP8"], cameraOn);
    // An answer nobody asked for is left alone.
    await h.s.receive(ev("m.call.negotiate", { call_id: callId, party_id: "theirs", description: { type: "answer", sdp: "x" } }));
    expect(peer.log.filter((l) => l === "remote:answer")).toHaveLength(1); // the call's own answer, from the start
    // After a stall an offer of my own is out: its answer is then taken.
    peer.bytes = { sent: 0, received: 1000, sendingCodec: "H264" };
    await seconds(h, 8);
    expect(h.sent.some((x) => x.type === "m.call.negotiate" && (x.content["description"] as { type: string }).type === "offer")).toBe(true);
    await h.s.receive(ev("m.call.negotiate", { call_id: callId, party_id: "theirs", description: { type: "answer", sdp: "y" } }));
    expect(peer.log.filter((l) => l === "remote:answer")).toHaveLength(2);
  });

  it("is not for my own echo, another session, or a call that is not up", async () => {
    const h = setup({ videoPeer: { sendable: ["VP8"] } });
    const { callId, peer } = await upVideoCall(h, ["VP8"]);
    const offer = { type: "offer", sdp: sdpWith("VP8") };
    await h.s.receive(ev("m.call.negotiate", { call_id: callId, party_id: "mine", description: offer }, { sender: "@me:s" }));
    await h.s.receive(ev("m.call.negotiate", { call_id: callId, party_id: "someone-else", description: offer }));
    expect(peer.log.includes("remote:offer")).toBe(false);
    const h2 = setup({ videoPeer: { sendable: ["VP8"] } });
    h2.video();
    await h2.s.place("!r:s", "@you:s", true);
    await h2.s.receive(ev("m.call.negotiate", { call_id: h2.sent[0]!.content["call_id"], party_id: "theirs", description: offer }));
    expect(h2.peers[0]!.log.includes("remote:offer")).toBe(false);
  });

  it("when both offer at once, the one that was called gives way and the caller ignores the other's offer", async () => {
    // I am the caller (impolite) with an offer out: the offer that crosses it is ignored.
    const h = setup({ videoPeer: { sendable: ["VP8", "H264"] } });
    const { callId, peer } = await upVideoCall(h, ["H264", "VP8"], cameraOn);
    peer.bytes = { sent: 0, received: 1000, sendingCodec: "H264" };
    await seconds(h, 8);
    expect(h.sent.some((x) => x.type === "m.call.negotiate")).toBe(true);
    await h.s.receive(ev("m.call.negotiate", { call_id: callId, party_id: "theirs", description: { type: "offer", sdp: sdpWith("VP8") } }));
    expect(peer.log.includes("remote:offer")).toBe(false);
  });
});

describe("watching the picture of a video call", () => {
  it("a picture that is sent and does not leave: the codec in use goes last and the call is offered again with the next, once", async () => {
    const h = setup({ videoPeer: { sendable: ["VP8", "H264"] } });
    const { peer } = await upVideoCall(h, ["H264", "VP8"]);
    peer.bytes = { sent: 0, received: 1000, sendingCodec: "H264" };
    await seconds(h, 10);
    const offers = h.sent.filter((x) => x.type === "m.call.negotiate");
    expect(offers).toHaveLength(1);
    expect((offers[0]!.content["description"] as { type: string }).type).toBe("offer");
    expect(peer.orders[peer.orders.length - 1]).toEqual(["VP8", "H264"]);
  });

  it("a picture that moves is left alone", async () => {
    const h = setup({ videoPeer: { sendable: ["VP8", "H264"] } });
    const { peer } = await upVideoCall(h, ["H264", "VP8"], cameraOn);
    for (let i = 0; i < 12; i++) {
      peer.bytes = { sent: 1000 * (i + 1), received: 2000 * (i + 1), sendingCodec: "H264" };
      await seconds(h, 1);
    }
    expect(h.sent.some((x) => x.type === "m.call.negotiate")).toBe(false);
  });

  it("a camera that is off sends nothing and that is no stall", async () => {
    const h = setup({ videoPeer: { sendable: ["VP8", "H264"] } });
    const { peer } = await upVideoCall(h, ["H264", "VP8"]);
    h.s.setCameraOff(true);
    peer.bytes = { sent: 0, received: 1000, sendingCodec: "H264" };
    await seconds(h, 10);
    expect(h.sent.some((x) => x.type === "m.call.negotiate")).toBe(false);
  });

  it("a picture that is to come and never does: the call is offered again with another codec first", async () => {
    const h = setup({ videoPeer: { sendable: ["VP8", "H264"] } });
    const { peer } = await upVideoCall(h, ["H264", "VP8"], cameraOn);
    // The camera here is off (nothing is expected to leave), the other side's is on and nothing arrives.
    h.s.setCameraOff(true);
    peer.bytes = { sent: 0, received: 0 };
    await seconds(h, 10);
    expect(h.sent.filter((x) => x.type === "m.call.negotiate")).toHaveLength(1);
    expect(peer.orders[peer.orders.length - 1]).toEqual(["VP8", "H264"]);
  });

  it("with no other codec to try nothing is offered", async () => {
    const h = setup({ videoPeer: { sendable: ["VP8"] } });
    const { peer } = await upVideoCall(h, ["VP8"]);
    peer.bytes = { sent: 0, received: 1000, sendingCodec: "VP8" };
    await seconds(h, 10);
    expect(h.sent.some((x) => x.type === "m.call.negotiate")).toBe(false);
  });

  it("the person is told while another codec is tried, and told no more once the picture moves", async () => {
    const h = setup({ videoPeer: { sendable: ["VP8", "H264"] } });
    const { callId, peer } = await upVideoCall(h, ["H264", "VP8"]);
    expect(h.last()!.videoNotice).toBeUndefined();
    peer.bytes = { sent: 0, received: 1000, sendingCodec: "H264" };
    await seconds(h, 8);
    expect(h.last()!.videoNotice).toBe("switching");
    // The other side answers the new offer, and the new codec sends: the notice goes.
    await h.s.receive(ev("m.call.negotiate", { call_id: callId, party_id: "theirs", description: { type: "answer", sdp: "y" } }));
    peer.bytes = { sent: 5000, received: 9000, sendingCodec: "VP8" };
    await seconds(h, 2);
    expect(h.last()!.videoNotice).toBeUndefined();
  });

  it("the person is told that nothing more can be done when no other codec is left", async () => {
    const h = setup({ videoPeer: { sendable: ["VP8"] } });
    const { peer } = await upVideoCall(h, ["VP8"]);
    peer.bytes = { sent: 0, received: 1000, sendingCodec: "VP8" };
    await seconds(h, 10);
    expect(h.last()!.videoNotice).toBe("unavailable");
  });

  it("an offer for another codec that is never answered ends in 'unavailable', not in 'trying' for ever", async () => {
    const h = setup({ videoPeer: { sendable: ["VP8", "H264"] } });
    const { peer } = await upVideoCall(h, ["H264", "VP8"]);
    peer.bytes = { sent: 0, received: 1000, sendingCodec: "H264" };
    await seconds(h, 8);
    expect(h.last()!.videoNotice).toBe("switching");
    // Nobody answers.
    h.tick(10_000);
    await flush();
    expect(h.last()!.videoNotice).toBe("unavailable");
  });

  it("a voice call is not watched, and the watch stops with the call", async () => {
    const h = setup({ videoPeer: { sendable: ["VP8", "H264"] } });
    await h.s.place("!r:s", "@you:s", false);
    await h.s.receive(ev("m.call.answer", { call_id: h.sent[0]!.content["call_id"], party_id: "theirs", answer: { type: "answer", sdp: "a" } }));
    h.peers[0]!.up("connected");
    h.peers[0]!.bytes = { sent: 0, received: 0 };
    await seconds(h, 10);
    expect(h.sent.some((x) => x.type === "m.call.negotiate")).toBe(false);

    const g = setup({ videoPeer: { sendable: ["VP8", "H264"] } });
    const { peer } = await upVideoCall(g, ["H264", "VP8"]);
    await g.s.hangup();
    peer.bytes = { sent: 0, received: 1000, sendingCodec: "H264" };
    await seconds(g, 10);
    expect(g.sent.some((x) => x.type === "m.call.negotiate")).toBe(false);
  });
});
