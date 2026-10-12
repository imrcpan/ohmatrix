// Integration test against src/dev/synapse (run `src/dev/synapse/up.sh` + seed first). OHMATRIX_LIVE=1 to enable.
import { expect, test } from "vitest";
import { applyUpdates, type RoomSummary, type TimelineItem } from "@ohmatrix/core";
import { JsSdkEngine } from "./index.js";

/** Creates a private room as the engine's user via the REST API (engines have no createRoom yet). */
async function scratchRoom(e: JsSdkEngine, encrypted = false): Promise<string> {
  const token = (e as unknown as { client: { getAccessToken(): string } }).client.getAccessToken();
  const r = await fetch("http://localhost:8008/_matrix/client/v3/createRoom", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `scratch ${Date.now()}`,
      preset: "private_chat",
      ...(encrypted && { initial_state: [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }] }),
    }),
  });
  return ((await r.json()) as { room_id: string }).room_id;
}

test.skipIf(!process.env.OHMATRIX_LIVE)(
  "login, sync, list rooms, read + send",
  async () => {
    const e = new JsSdkEngine({ cryptoStorage: "memory" });
    await e.auth.loginWithPassword("http://localhost:8008", "test", "123456");
    let rooms: RoomSummary[] = [];
    e.rooms.subscribe((u) => {
      rooms = applyUpdates(rooms, u);
    });
    await e.sync.start();
    await expect.poll(() => rooms.length, { timeout: 15000 }).toBeGreaterThanOrEqual(3);
    const dev = rooms.find((r) => r.name === "OhMatrix Dev")!;
    expect(dev).toBeTruthy();
    expect(rooms.some((r) => r.isDirect)).toBe(true);
    const tl = e.openTimeline(dev.id);
    let items: TimelineItem[] = [];
    tl.subscribe((u) => {
      items = applyUpdates(items, u);
    });
    expect(items.length).toBeGreaterThan(3);
    const before = items.length;
    await tl.paginateBackwards();
    await expect.poll(() => items.length, { timeout: 10000 }).toBeGreaterThan(before);
    tl.close();
    // Send into a scratch room so the seeded dev room stays stable for other tests.
    const roomId = await scratchRoom(e);
    await expect.poll(() => rooms.some((r) => r.id === roomId), { timeout: 15000 }).toBe(true);
    const st = e.openTimeline(roomId);
    let sent: TimelineItem[] = [];
    st.subscribe((u) => {
      sent = applyUpdates(sent, u);
    });
    const text = `live-test ${Date.now()}`;
    await st.sendText(text);
    await expect.poll(() => sent.filter((i) => i.content.kind === "text" && i.content.body === text && i.status === "sent").length).toBe(1);
    st.close();
    await e.sync.stop();
  },
  40000,
);

test.skipIf(!process.env.OHMATRIX_LIVE)(
  "reactions toggle on and off",
  async () => {
    const e = new JsSdkEngine({ cryptoStorage: "memory" });
    await e.auth.loginWithPassword("http://localhost:8008", "test", "123456");
    let rooms: RoomSummary[] = [];
    e.rooms.subscribe((u) => {
      rooms = applyUpdates(rooms, u);
    });
    await e.sync.start();
    const roomId = await scratchRoom(e);
    await expect.poll(() => rooms.some((r) => r.id === roomId), { timeout: 15000 }).toBe(true);
    const tl = e.openTimeline(roomId);
    let items: TimelineItem[] = [];
    tl.subscribe((u) => {
      items = applyUpdates(items, u);
    });
    await tl.sendText("react to me");
    await expect.poll(() => items.find((i) => i.content.kind === "text" && i.status === "sent")?.id, { timeout: 10000 }).toBeTruthy();
    const target = items.find((i) => i.content.kind === "text")!;
    const mineOn = () => items.find((i) => i.id === target.id)?.reactions?.find((r) => r.key === "👍");
    await tl.react(target.id, "👍");
    await expect.poll(() => mineOn()?.mine, { timeout: 10000 }).toBe(true);
    await tl.react(target.id, "👍");
    await expect.poll(mineOn, { timeout: 10000 }).toBeUndefined();
    tl.close();
    await e.sync.stop();
  },
  40000,
);

test.skipIf(!process.env.OHMATRIX_LIVE)(
  "replies carry the quoted message",
  async () => {
    const e = new JsSdkEngine({ cryptoStorage: "memory" });
    await e.auth.loginWithPassword("http://localhost:8008", "test", "123456");
    let rooms: RoomSummary[] = [];
    e.rooms.subscribe((u) => {
      rooms = applyUpdates(rooms, u);
    });
    await e.sync.start();
    const roomId = await scratchRoom(e);
    await expect.poll(() => rooms.some((r) => r.id === roomId), { timeout: 15000 }).toBe(true);
    const tl = e.openTimeline(roomId);
    let items: TimelineItem[] = [];
    tl.subscribe((u) => {
      items = applyUpdates(items, u);
    });
    await tl.sendText("original question");
    await expect.poll(() => items.find((i) => i.status === "sent" && i.content.kind === "text")?.id, { timeout: 10000 }).toBeTruthy();
    const original = items.find((i) => i.content.kind === "text")!;
    await tl.reply(original.id, "the answer");
    await expect
      .poll(() => items.find((i) => i.content.kind === "text" && i.content.body === "the answer")?.replyTo, { timeout: 10000 })
      .toMatchObject({ id: original.id, preview: "original question" });
    tl.close();
    await e.sync.stop();
  },
  40000,
);

test.skipIf(!process.env.OHMATRIX_LIVE)(
  "edit shows the new text, delete removes the message",
  async () => {
    const e = new JsSdkEngine({ cryptoStorage: "memory" });
    await e.auth.loginWithPassword("http://localhost:8008", "test", "123456");
    let rooms: RoomSummary[] = [];
    e.rooms.subscribe((u) => {
      rooms = applyUpdates(rooms, u);
    });
    await e.sync.start();
    const roomId = await scratchRoom(e);
    await expect.poll(() => rooms.some((r) => r.id === roomId), { timeout: 15000 }).toBe(true);
    const tl = e.openTimeline(roomId);
    let items: TimelineItem[] = [];
    tl.subscribe((u) => {
      items = applyUpdates(items, u);
    });
    await tl.sendText("typo mesage");
    await expect.poll(() => items.find((i) => i.content.kind === "text" && i.status === "sent")?.id, { timeout: 10000 }).toBeTruthy();
    const id = items.find((i) => i.content.kind === "text")!.id;
    await tl.edit(id, "fixed message");
    await expect.poll(() => items.find((i) => i.id === id), { timeout: 10000 }).toMatchObject({ content: { body: "fixed message" }, edited: true });
    expect(items.filter((i) => i.content.kind === "text")).toHaveLength(1);
    await tl.redact(id);
    await expect.poll(() => items.some((i) => i.id === id), { timeout: 10000 }).toBe(false);
    tl.close();
    await e.sync.stop();
  },
  40000,
);

const PNG_1X1 = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (c) =>
  c.charCodeAt(0),
);

for (const encrypted of [false, true]) {
  test.skipIf(!process.env.OHMATRIX_LIVE)(
    `attachments: image and file${encrypted ? " (encrypted room)" : ""}`,
    async () => {
      const e = new JsSdkEngine({ cryptoStorage: "memory" });
      await e.auth.loginWithPassword("http://localhost:8008", "test", "123456");
      let rooms: RoomSummary[] = [];
      e.rooms.subscribe((u) => {
        rooms = applyUpdates(rooms, u);
      });
      await e.sync.start();
      const roomId = await scratchRoom(e, encrypted);
      await expect.poll(() => rooms.some((r) => r.id === roomId), { timeout: 15000 }).toBe(true);
      // Wait until the room's encryption state has synced so the engine knows to encrypt the upload.
      if (encrypted)
        await expect
          .poll(() => (e as unknown as { client: { isRoomEncrypted(id: string): boolean } }).client.isRoomEncrypted(roomId), { timeout: 15000 })
          .toBe(true);
      const tl = e.openTimeline(roomId);
      let items: TimelineItem[] = [];
      tl.subscribe((u) => {
        items = applyUpdates(items, u);
      });
      await tl.sendAttachment({ name: "dot.png", mimeType: "image/png", size: PNG_1X1.length, data: new Blob([PNG_1X1], { type: "image/png" }) });
      await tl.sendAttachment({ name: "notes.txt", mimeType: "text/plain", size: 5, data: new Blob(["hello"], { type: "text/plain" }) });
      await expect
        .poll(() => items.filter((i) => i.status === "sent" && (i.content.kind === "image" || i.content.kind === "file")).length, { timeout: 20000 })
        .toBe(2);
      const img = items.find((i) => i.content.kind === "image")!.content as Extract<TimelineItem["content"], { kind: "image" }>;
      const file = items.find((i) => i.content.kind === "file")!.content as Extract<TimelineItem["content"], { kind: "file" }>;
      expect(!!img.encryption).toBe(encrypted);
      expect(!!file.encryption).toBe(encrypted);
      expect(file.name).toBe("notes.txt");
      const imgUrl = await e.media.resolve(img.url, { encryption: img.encryption, mimeType: img.mimeType });
      const fileUrl = await e.media.resolve(file.url, { encryption: file.encryption, mimeType: file.mimeType });
      expect(new Uint8Array(await (await fetch(imgUrl)).arrayBuffer())).toEqual(PNG_1X1);
      expect(await (await fetch(fileUrl)).text()).toBe("hello");
      tl.close();
      await e.sync.stop();
    },
    60000,
  );
}

test.skipIf(!process.env.OHMATRIX_LIVE)(
  "create direct chat (reused), group, and join a public room",
  async () => {
    const e = new JsSdkEngine({ cryptoStorage: "memory" });
    const s = await e.auth.loginWithPassword("http://localhost:8008", "test", "123456");
    let rooms: RoomSummary[] = [];
    e.rooms.subscribe((u) => {
      rooms = applyUpdates(rooms, u);
    });
    await e.sync.start();
    await expect.poll(() => rooms.length, { timeout: 15000 }).toBeGreaterThan(0);

    await expect(e.rooms.createDirect("alice")).rejects.toMatchObject({ code: "not_found" });
    await expect(e.rooms.createDirect("@nobody-here:localhost")).rejects.toMatchObject({ code: "not_found" });
    const dm = await e.rooms.createDirect("@bob:localhost");
    await expect.poll(() => rooms.find((r) => r.id === dm)?.isDirect, { timeout: 15000 }).toBe(true);
    expect(await e.rooms.createDirect("@bob:localhost")).toBe(dm);

    const group = await e.rooms.createGroup({ name: `Group ${Date.now()}`, invite: ["@alice:localhost"] });
    await expect.poll(() => rooms.find((r) => r.id === group)?.isDirect, { timeout: 15000 }).toBe(false);

    const al = (await (
      await fetch("http://localhost:8008/_matrix/client/v3/login", {
        method: "POST",
        body: JSON.stringify({ type: "m.login.password", identifier: { type: "m.id.user", user: "alice" }, password: "123456" }),
      })
    ).json()) as { access_token: string };
    const pub = (await (
      await fetch("http://localhost:8008/_matrix/client/v3/createRoom", {
        method: "POST",
        headers: { authorization: `Bearer ${al.access_token}` },
        body: JSON.stringify({ name: "Public", preset: "public_chat" }),
      })
    ).json()) as { room_id: string };
    expect(await e.rooms.joinRoom(pub.room_id)).toBe(pub.room_id);
    await expect.poll(() => rooms.some((r) => r.id === pub.room_id), { timeout: 15000 }).toBe(true);
    void s;
    await e.sync.stop();
  },
  60000,
);

test.skipIf(!process.env.OHMATRIX_LIVE)(
  "profile: read, rename and set avatar",
  async () => {
    const e = new JsSdkEngine({ cryptoStorage: "memory" });
    const name = `pf${Date.now().toString(36)}`;
    const { createHmac } = await import("node:crypto");
    const { nonce } = (await (await fetch("http://localhost:8008/_synapse/admin/v1/register")).json()) as { nonce: string };
    const mac = createHmac("sha1", "ohmatrix-dev-secret").update(`${nonce}\0${name}\0pw12345\0notadmin`).digest("hex");
    await fetch("http://localhost:8008/_synapse/admin/v1/register", {
      method: "POST",
      body: JSON.stringify({ nonce, username: name, password: "pw12345", admin: false, mac }),
    });
    await e.auth.loginWithPassword("http://localhost:8008", name, "pw12345");
    let profile: import("@ohmatrix/core").Profile | null = null;
    e.profile.subscribe((p) => {
      profile = p;
    });
    await e.sync.start();
    await expect.poll(() => (profile as { userId: string } | null)?.userId, { timeout: 15000 }).toBe(`@${name}:localhost`);
    await e.profile.setDisplayName("Pat Example");
    await expect.poll(() => (profile as { displayName: string } | null)?.displayName).toBe("Pat Example");
    await e.profile.setAvatar({ name: "a.png", mimeType: "image/png", size: PNG_1X1.length, data: new Blob([PNG_1X1], { type: "image/png" }) });
    await expect.poll(() => (profile as { avatar?: string } | null)?.avatar, { timeout: 10000 }).toMatch(/^mxc:\/\//);
    await e.sync.stop();
  },
  40000,
);

test.skipIf(!process.env.OHMATRIX_LIVE)(
  "pin and mark-unread",
  async () => {
    const e = new JsSdkEngine({ cryptoStorage: "memory" });
    await e.auth.loginWithPassword("http://localhost:8008", "test", "123456");
    let rooms: RoomSummary[] = [];
    e.rooms.subscribe((u) => {
      rooms = applyUpdates(rooms, u);
    });
    await e.sync.start();
    const roomId = await scratchRoom(e);
    await expect.poll(() => rooms.some((r) => r.id === roomId), { timeout: 15000 }).toBe(true);
    const other = await scratchRoom(e);
    await expect.poll(() => rooms.some((r) => r.id === other), { timeout: 15000 }).toBe(true);
    // `other` was created later so it sorts first; pinning `roomId` must lift it above.
    await e.rooms.setPinned(roomId, true);
    const idx = (id: string) => rooms.findIndex((r) => r.id === id);
    await expect.poll(() => rooms.find((r) => r.id === roomId)?.pinned, { timeout: 10000 }).toBe(true);
    expect(idx(roomId)).toBeLessThan(idx(other)); // (pending invitations may still sort above both)
    await e.rooms.setPinned(roomId, false);
    await expect.poll(() => rooms.find((r) => r.id === roomId)?.pinned, { timeout: 10000 }).toBeUndefined();

    await e.rooms.setMarkedUnread(other, true);
    await expect.poll(() => rooms.find((r) => r.id === other)?.markedUnread, { timeout: 10000 }).toBe(true);
    const tl = e.openTimeline(other);
    await tl.markRead(); // opening/reading a chat clears the manual mark
    await expect.poll(() => rooms.find((r) => r.id === other)?.markedUnread, { timeout: 10000 }).toBeUndefined();
    tl.close();
    await e.sync.stop();
  },
  60000,
);

test.skipIf(!process.env.OHMATRIX_LIVE)(
  "room details (members, topic) and leave",
  async () => {
    const e = new JsSdkEngine({ cryptoStorage: "memory" });
    await e.auth.loginWithPassword("http://localhost:8008", "test", "123456");
    let rooms: RoomSummary[] = [];
    e.rooms.subscribe((u) => {
      rooms = applyUpdates(rooms, u);
    });
    await e.sync.start();
    const id = await e.rooms.createGroup({ name: `Info ${Date.now()}`, invite: ["@alice:localhost"] });
    await expect.poll(() => rooms.some((r) => r.id === id), { timeout: 15000 }).toBe(true);
    let details: import("@ohmatrix/core").RoomDetails | null = null;
    const off = e.rooms.subscribeDetails(id, (d) => {
      details = d;
    });
    await expect.poll(() => (details as { members: unknown[] } | null)?.members.length, { timeout: 10000 }).toBe(2);
    const d = details as unknown as import("@ohmatrix/core").RoomDetails;
    expect(d.isDirect).toBe(false);
    expect(d.isEncrypted).toBe(true);
    expect(d.members.map((m) => [m.name, m.role, !!m.invited])).toEqual([
      ["test", "admin", false],
      ["alice", "member", true],
    ]);
    off();

    await e.rooms.leave(id);
    await expect.poll(() => rooms.some((r) => r.id === id), { timeout: 15000 }).toBe(false);
    await e.sync.stop();
  },
  60000,
);

test.skipIf(!process.env.OHMATRIX_LIVE)(
  "user directory search",
  async () => {
    const e = new JsSdkEngine({ cryptoStorage: "memory" });
    await e.auth.loginWithPassword("http://localhost:8008", "test", "123456");
    await e.sync.start();
    expect(await e.users.search("   ")).toEqual([]);
    const ali = await e.users.search("ali");
    expect(ali.map((u) => u.userId)).toContain("@alice:localhost");
    expect(ali.map((u) => u.userId)).not.toContain("@test:localhost"); // never myself
    expect((await e.users.search("test")).map((u) => u.userId)).not.toContain("@test:localhost");
    // A full id is resolved by profile lookup even if the directory would not list it.
    expect((await e.users.search("@bob:localhost")).map((u) => u.userId)).toContain("@bob:localhost");
    expect(await e.users.search("@nobody-here:localhost")).toEqual([]);
    await e.sync.stop();
  },
  40000,
);

test.skipIf(!process.env.OHMATRIX_LIVE)(
  "typing indicators and read receipts between two users",
  async () => {
    const a = new JsSdkEngine({ cryptoStorage: "memory" });
    const b = new JsSdkEngine({ cryptoStorage: "memory" });
    await a.auth.loginWithPassword("http://localhost:8008", "alice", "123456");
    await b.auth.loginWithPassword("http://localhost:8008", "bob", "123456");
    let aRooms: RoomSummary[] = [],
      bRooms: RoomSummary[] = [];
    a.rooms.subscribe((u) => {
      aRooms = applyUpdates(aRooms, u);
    });
    b.rooms.subscribe((u) => {
      bRooms = applyUpdates(bRooms, u);
    });
    await a.sync.start();
    await b.sync.start();
    const roomId = await a.rooms.createGroup({ name: `Receipts ${Date.now()}`, invite: ["@bob:localhost"] });
    await expect.poll(() => bRooms.some((r) => r.id === roomId && r.invite), { timeout: 15000 }).toBe(true);
    await b.rooms.acceptInvite(roomId);
    await expect.poll(() => bRooms.some((r) => r.id === roomId && !r.invite), { timeout: 15000 }).toBe(true);

    const ta = a.openTimeline(roomId);
    let items: TimelineItem[] = [];
    ta.subscribe((u) => {
      items = applyUpdates(items, u);
    });
    const tb = b.openTimeline(roomId);

    // Typing: bob types, alice sees "bob" (also on the room summary); stops → cleared.
    let typing: string[] = [];
    ta.onTyping((n) => {
      typing = n;
    });
    tb.setTyping(true);
    await expect.poll(() => typing, { timeout: 10000 }).toEqual(["bob"]);
    await expect.poll(() => aRooms.find((r) => r.id === roomId)?.typing, { timeout: 10000 }).toEqual(["bob"]);
    tb.setTyping(false);
    await expect.poll(() => typing, { timeout: 10000 }).toEqual([]);
    await expect.poll(() => aRooms.find((r) => r.id === roomId)?.typing, { timeout: 10000 }).toBeUndefined();

    // Receipts: alice's message is unread until bob reads it.
    await ta.sendText("did you read this?");
    await expect.poll(() => items.find((i) => i.content.kind === "text" && i.status === "sent")?.id, { timeout: 10000 }).toBeTruthy();
    const msg = () => items.find((i) => i.content.kind === "text" && i.content.body === "did you read this?")!;
    expect(msg().readBy).toBeUndefined();
    await expect.poll(() => bRooms.find((r) => r.id === roomId)?.unreadCount, { timeout: 10000 }).toBeGreaterThan(0);
    await tb.markRead();
    await expect.poll(() => msg().readBy?.map((r) => r.name), { timeout: 10000 }).toEqual(["bob"]);
    ta.close();
    tb.close();
    await a.sync.stop();
    await b.sync.stop();
  },
  90000,
);

test.skipIf(!process.env.OHMATRIX_LIVE)(
  "notifications: live messages from others only; muted rooms are silent; encrypted rooms are decrypted for the preview",
  async () => {
    const a = new JsSdkEngine({ cryptoStorage: "memory" });
    const b = new JsSdkEngine({ cryptoStorage: "memory" });
    await a.auth.loginWithPassword("http://localhost:8008", "alice", "123456");
    await b.auth.loginWithPassword("http://localhost:8008", "bob", "123456");
    const got: import("@ohmatrix/core").IncomingNotification[] = [];
    b.notifications.subscribe((n) => got.push(n));
    let bRooms: RoomSummary[] = [];
    b.rooms.subscribe((u) => {
      bRooms = applyUpdates(bRooms, u);
    });
    await a.sync.start();
    await b.sync.start();
    const plain = await a.rooms.createGroup({ name: `Notify ${Date.now()}`, invite: ["@bob:localhost"] });
    await expect.poll(() => bRooms.some((r) => r.id === plain && r.invite), { timeout: 15000 }).toBe(true);
    await b.rooms.acceptInvite(plain);
    await expect.poll(() => bRooms.some((r) => r.id === plain && !r.invite), { timeout: 15000 }).toBe(true);
    expect(got).toEqual([]); // joining and history are not notifications

    const ta = a.openTimeline(plain);
    const tb = b.openTimeline(plain);
    await tb.sendText("my own message"); // never notifies me
    await ta.sendText("hello bob");
    await expect.poll(() => got.length, { timeout: 15000 }).toBe(1);
    expect(got[0]).toMatchObject({ roomId: plain, senderName: "alice", isDirect: false, preview: "hello bob" });
    expect(got.some((n) => n.preview === "my own message")).toBe(false);

    // Muting the room silences it (and shows as muted in the list).
    await b.rooms.setMuted(plain, true);
    await expect.poll(() => bRooms.find((r) => r.id === plain)?.muted, { timeout: 10000 }).toBe(true);
    await ta.sendText("are you there?");
    await new Promise((r) => setTimeout(r, 3000));
    expect(got).toHaveLength(1);
    await b.rooms.setMuted(plain, false);
    await expect.poll(() => bRooms.find((r) => r.id === plain)?.muted, { timeout: 10000 }).toBeUndefined();
    await ta.sendText("back again");
    await expect.poll(() => got.length, { timeout: 15000 }).toBe(2);
    expect(got[1]!.preview).toBe("back again");
    ta.close();
    tb.close();
    await a.sync.stop();
    await b.sync.stop();
  },
  90000,
);
