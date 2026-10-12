// Integration tests for end-to-end encryption against src/dev/synapse. OHMATRIX_LIVE=1 to enable.
import { createHmac } from "node:crypto";
import { createClient, type MatrixClient } from "matrix-js-sdk";
import { expect, test } from "vitest";
import { applyUpdates, type RoomSummary, type TimelineItem } from "@ohmatrix/core";
import { JsSdkEngine } from "./index.js";

const HS = "http://localhost:8008";
const live = !!process.env.OHMATRIX_LIVE;

async function registerUser(name: string, password: string) {
  const { nonce } = (await (await fetch(`${HS}/_synapse/admin/v1/register`)).json()) as { nonce: string };
  const mac = createHmac("sha1", "ohmatrix-dev-secret").update(`${nonce}\0${name}\0${password}\0notadmin`).digest("hex");
  const r = await fetch(`${HS}/_synapse/admin/v1/register`, { method: "POST", body: JSON.stringify({ nonce, username: name, password, admin: false, mac }) });
  if (!r.ok) throw new Error(`register ${name}: ${await r.text()}`);
}

async function rawClient(user: string, password: string): Promise<MatrixClient> {
  const c = createClient({ baseUrl: HS });
  const res = await c.login("m.login.password", { identifier: { type: "m.id.user", user }, password });
  const client = createClient({ baseUrl: HS, accessToken: res.access_token, userId: res.user_id, deviceId: res.device_id });
  await client.initRustCrypto({ useIndexedDB: false });
  await client.startClient({ initialSyncLimit: 5 });
  return client;
}

const watch = (e: JsSdkEngine) => {
  const st = { rooms: [] as RoomSummary[] };
  e.rooms.subscribe((u) => {
    st.rooms = applyUpdates(st.rooms, u);
  });
  return st;
};
const timeline = (e: JsSdkEngine, roomId: string) => {
  const h = e.openTimeline(roomId);
  const st = { items: [] as TimelineItem[], h };
  h.subscribe((u) => {
    st.items = applyUpdates(st.items, u);
  });
  return st;
};
const texts = (items: TimelineItem[]) => items.filter((i) => i.content.kind === "text").map((i) => (i.content as { body: string }).body);

test.skipIf(!live)(
  "decrypts incoming and sends encrypted messages",
  async () => {
    const suffix = Date.now().toString(36);
    const [u1, u2] = [`ea${suffix}`, `eb${suffix}`];
    await registerUser(u1, "pw12345");
    await registerUser(u2, "pw12345");
    const alice = await rawClient(u1, "pw12345");
    const bob = new JsSdkEngine({ cryptoStorage: "memory" });
    const session = await bob.auth.loginWithPassword(HS, u2, "pw12345");
    const bobRooms = watch(bob);
    await bob.sync.start();
    await expect.poll(() => bob.security.state(), { timeout: 15000 }).toBe("needs_setup");

    const { room_id } = await alice.createRoom({
      preset: "private_chat" as never,
      invite: [`@${u2}:localhost`],
      initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
    });
    await fetch(`${HS}/_matrix/client/v3/join/${encodeURIComponent(room_id)}`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.accessToken}` },
      body: "{}",
    });
    await expect.poll(() => bobRooms.rooms.some((r) => r.id === room_id), { timeout: 15000 }).toBe(true);
    const tl = timeline(bob, room_id);

    await alice.sendTextMessage(room_id, "secret hello");
    await expect.poll(() => texts(tl.items), { timeout: 20000 }).toContain("secret hello");

    await tl.h.sendText("secret reply");
    await expect
      .poll(
        async () => {
          const evs = alice.getRoom(room_id)?.getLiveTimeline().getEvents() ?? [];
          return evs.map((e) => e.getClearContent()?.body);
        },
        { timeout: 20000 },
      )
      .toContain("secret reply");
    tl.h.close();
    await bob.sync.stop();
    alice.stopClient();
  },
  90000,
);

test.skipIf(!live)(
  "recovery key setup and restore on a second device",
  async () => {
    const name = `es${Date.now().toString(36)}`;
    await registerUser(name, "pw12345");
    const a = new JsSdkEngine({ cryptoStorage: "memory" });
    const sa = await a.auth.loginWithPassword(HS, name, "pw12345");
    await a.sync.start();
    await expect.poll(() => a.security.state(), { timeout: 15000 }).toBe("needs_setup");
    const { recoveryKey } = await a.security.setUp({ password: "pw12345" });
    expect(recoveryKey.length).toBeGreaterThan(20);
    expect(await a.security.state()).toBe("ready");

    // Encrypted room with history created by device A.
    const peer = `ep${Date.now().toString(36)}`;
    await registerUser(peer, "pw12345");
    const r = await fetch(`${HS}/_matrix/client/v3/createRoom`, {
      method: "POST",
      headers: { authorization: `Bearer ${sa.accessToken}` },
      body: JSON.stringify({
        preset: "private_chat",
        initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }],
      }),
    });
    const { room_id } = (await r.json()) as { room_id: string };
    const rooms = watch(a);
    await expect.poll(() => rooms.rooms.some((x) => x.id === room_id), { timeout: 15000 }).toBe(true);
    const ta = timeline(a, room_id);
    await ta.h.sendText("history before new device");
    await expect.poll(() => ta.items.some((i) => i.status === "sent"), { timeout: 15000 }).toBe(true);
    await new Promise((res) => setTimeout(res, 6000)); // let the key backup upload

    const b = new JsSdkEngine({ cryptoStorage: "memory" });
    await b.auth.loginWithPassword(HS, name, "pw12345");
    const roomsB = watch(b);
    await b.sync.start();
    await expect.poll(() => b.security.state(), { timeout: 20000 }).toBe("needs_recovery");
    await expect(b.security.restoreWithRecoveryKey("EsTc 1234 5678")).rejects.toMatchObject({ name: "EngineError", code: "forbidden" });
    await b.security.restoreWithRecoveryKey(recoveryKey);
    expect(await b.security.state()).toBe("ready");
    await expect.poll(() => roomsB.rooms.some((x) => x.id === room_id), { timeout: 15000 }).toBe(true);
    const tb = timeline(b, room_id);
    await expect.poll(() => texts(tb.items), { timeout: 20000 }).toContain("history before new device");
    ta.h.close();
    tb.h.close();
    await a.sync.stop();
    await b.sync.stop();
  },
  120000,
);
