import { describe, expect, it } from "vitest";
import type { CallState } from "@ohmatrix/core";
import { RustCalls, type CallPlatform } from "./calls.js";
import type { IceCandidate, Peer, SessionDescription } from "./callSignalling.js";
import type { RawCallEvent, SdkClient } from "./sdk.js";

class Peer1 implements Peer {
  async createOffer(): Promise<SessionDescription> {
    return { type: "offer", sdp: "v=0 m=audio" };
  }
  async createAnswer(): Promise<SessionDescription> {
    return { type: "answer", sdp: "x" };
  }
  async setLocalDescription() {}
  async setRemoteDescription() {}
  async addIceCandidate(_c: IceCandidate) {}
  close() {}
  onCandidate() {}
  onConnection() {}
}

function setup(opts: { supported?: boolean; members?: { userId: string; membership: string }[] } = {}) {
  const sent: { room: string; type: string; content: Record<string, unknown> }[] = [];
  let push: (e: RawCallEvent) => void = () => {};
  const media = { start: async () => {}, setMuted() {}, setCameraOff() {}, stop() {} };
  let streamsChanged = () => {};
  let streams: { remote?: unknown; local?: unknown } = {};
  const platform: CallPlatform = {
    newPeer: () => new Peer1(),
    media,
    streams: () => streams,
    onStreams: (cb) => (streamsChanged = cb),
    newId: (() => {
      let n = 0;
      return () => `id${++n}`;
    })(),
  };
  const client = {
    userId: () => "@me:s",
    session: () => ({ homeserverUrl: "https://s", accessToken: "t", userId: "@me:s", deviceId: "D", slidingSyncVersion: null }),
    room: (id: string) => ({ sendRaw: async (type: string, content: string) => void sent.push({ room: id, type, content: JSON.parse(content) }) }),
    ...(opts.supported === false ? {} : { onCallEvents: (cb: (e: RawCallEvent) => void) => ((push = cb), { cancel: () => (push = () => {}) }) }),
  } as unknown as SdkClient;
  const calls = new RustCalls(
    platform,
    () => async () => ({ ok: true, json: async () => ({ uris: ["turn:t:3478"], username: "u", password: "p" }) }) as never,
    async (u) => ({ name: u === "@you:s" ? "You" : u }),
    async () => (opts.members ? opts.members.find((m) => m.userId !== "@me:s")?.userId : "@you:s"),
  );
  calls.attach(client);
  const states: (CallState | null)[] = [];
  calls.subscribe((c) => states.push(c));
  return {
    calls,
    sent,
    push: (e: Partial<RawCallEvent>) => push({ roomId: "!r:s", type: "m.call.invite", sender: "@you:s", eventId: "$e", ageMs: 0, contentJson: "{}", ...e }),
    states,
    setStreams: (s: typeof streams) => ((streams = s), streamsChanged()),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("calls on the phone", () => {
  it("is supported only with the platform's WebRTC and a library that has the call events", () => {
    expect(setup().calls.supported).toBe(true);
    expect(setup({ supported: false }).calls.supported).toBe(false);
  });

  it("rings with the caller's name for an invitation that arrives, and sends the answer into the same room", async () => {
    const h = setup();
    h.push({
      contentJson: JSON.stringify({
        call_id: "c1",
        party_id: "p",
        version: "1",
        lifetime: 60000,
        invitee: "@me:s",
        offer: { type: "offer", sdp: "v=0 m=audio m=video" },
      }),
    });
    await tick();
    expect(h.states.at(-1)).toMatchObject({ incoming: true, phase: "ringing", video: true, peer: { userId: "@you:s", name: "You" } });
    await h.calls.answer(true);
    await tick();
    expect(h.sent.find((x) => x.type === "m.call.answer")).toMatchObject({ room: "!r:s", content: { call_id: "c1", version: "1" } });
  });

  it("calls the other person of a one-to-one chat, and refuses a chat that has no single other person", async () => {
    const h = setup();
    await h.calls.place("!r:s", false);
    expect(h.sent[0]).toMatchObject({ room: "!r:s", type: "m.call.invite", content: { invitee: "@you:s" } });
    expect(h.states.at(-1)).toMatchObject({ incoming: false, phase: "ringing", peer: { name: "You" } });
    const g = setup({ members: [] });
    await expect(g.calls.place("!r:s", false)).rejects.toMatchObject({ code: "unsupported" });
  });

  it("gives the screen the other side's picture when the platform has one", async () => {
    const h = setup();
    await h.calls.place("!r:s", true);
    const remote = { id: "stream" };
    h.setStreams({ remote });
    await tick();
    expect(h.states.at(-1)).toMatchObject({ remote, remoteCameraOff: false });
  });

  it("says unsupported for sharing the screen, and is quiet after it is detached", async () => {
    const h = setup();
    await expect(h.calls.setSharing()).rejects.toMatchObject({ code: "unsupported" });
    h.calls.detach();
    expect(h.states.at(-1)).toBeNull();
  });
});
