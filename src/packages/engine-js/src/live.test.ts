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

test.skipIf(!process.env.OHMATRIX_LIVE)(
  "profile status and sessions: set/clear status, list devices, sign out others with the password",
  async () => {
    const { createHmac } = await import("node:crypto");
    const name = `sx${Date.now().toString(36)}`;
    const { nonce } = (await (await fetch("http://localhost:8008/_synapse/admin/v1/register")).json()) as { nonce: string };
    const mac = createHmac("sha1", "ohmatrix-dev-secret").update(`${nonce}\0${name}\0pw12345\0notadmin`).digest("hex");
    await fetch("http://localhost:8008/_synapse/admin/v1/register", {
      method: "POST",
      body: JSON.stringify({ nonce, username: name, password: "pw12345", admin: false, mac }),
    });
    const e = new JsSdkEngine({ cryptoStorage: "memory" });
    const session = await e.auth.loginWithPassword("http://localhost:8008", name, "pw12345");
    let profile: import("@ohmatrix/core").Profile | null = null;
    e.profile.subscribe((p) => {
      profile = p;
    });
    await e.sync.start();
    await expect.poll(() => (profile as { userId: string } | null)?.userId, { timeout: 15000 }).toBe(`@${name}:localhost`);

    // Status line is a public profile field: set, read back (also by others), clear.
    expect((profile as { status?: string } | null)?.status).toBeUndefined();
    await e.profile.setStatus("  Busy building  ");
    await expect.poll(() => (profile as { status?: string } | null)?.status, { timeout: 10000 }).toBe("Busy building");
    const pub = (await (await fetch(`http://localhost:8008/_matrix/client/v3/profile/@${name}:localhost`)).json()) as Record<string, string>;
    expect(pub["com.ohmatrix.status"]).toBe("Busy building");
    await e.profile.setStatus("");
    await expect.poll(() => (profile as { status?: string } | null)?.status, { timeout: 10000 }).toBeUndefined();

    // Sessions: this one first and flagged; two more logins appear; wrong password is refused; the right one signs them out.
    const login = async () =>
      (await (
        await fetch("http://localhost:8008/_matrix/client/v3/login", {
          method: "POST",
          body: JSON.stringify({
            type: "m.login.password",
            identifier: { type: "m.id.user", user: name },
            password: "pw12345",
            initial_device_display_name: "Phone",
          }),
        })
      ).json()) as { device_id: string };
    const [p1, p2] = [await login(), await login()];
    const list = await e.devices.list();
    expect(list[0]).toMatchObject({ id: session.deviceId, current: true });
    expect(list.filter((d) => d.current)).toHaveLength(1);
    expect(
      list
        .filter((d) => d.name === "Phone")
        .map((d) => d.id)
        .sort(),
    ).toEqual([p1.device_id, p2.device_id].sort());
    await expect(e.devices.remove([p1.device_id], "wrong-password")).rejects.toMatchObject({ code: "forbidden" });
    expect((await e.devices.list()).map((d) => d.id)).toContain(p1.device_id);
    await e.devices.remove([p1.device_id], "pw12345");
    expect((await e.devices.list()).map((d) => d.id)).not.toContain(p1.device_id);
    const others = (await e.devices.list()).filter((d) => !d.current).map((d) => d.id);
    await e.devices.remove([session.deviceId, ...others], "pw12345"); // the running session is never removed here
    const left = await e.devices.list();
    expect(left.map((d) => d.id)).toEqual([session.deviceId]);
    await e.sync.stop();
  },
  60000,
);

test.skipIf(!process.env.OHMATRIX_LIVE)(
  "room administration: edit info, invite, roles and permissions, remove, mute",
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
    const room = await a.rooms.createGroup({ name: `Admin ${Date.now()}`, invite: ["@bob:localhost"] });
    await expect.poll(() => bRooms.some((r) => r.id === room && r.invite), { timeout: 15000 }).toBe(true);
    await b.rooms.acceptInvite(room);
    await expect.poll(() => bRooms.some((r) => r.id === room && !r.invite), { timeout: 15000 }).toBe(true);

    const watch = (e: JsSdkEngine) => {
      const st = { d: null as import("@ohmatrix/core").RoomDetails | null };
      e.rooms.subscribeDetails(room, (d) => {
        st.d = d;
      });
      return st;
    };
    const da = watch(a),
      db = watch(b);
    await expect.poll(() => da.d?.members.filter((m) => !m.invited).length, { timeout: 15000 }).toBe(2);
    await expect.poll(() => db.d?.members.filter((m) => !m.invited).length, { timeout: 15000 }).toBe(2);

    // Permissions follow the power levels: the creator is an admin who can do everything; a plain member can do nothing.
    expect(da.d).toMatchObject({ myRole: "admin", muted: false, can: { editInfo: true, invite: true, kick: true, changeRoles: true } });
    expect(db.d).toMatchObject({ myRole: "member", can: { editInfo: false, kick: false, changeRoles: false } });
    await expect(b.roomAdmin.setName(room, "Hijacked")).rejects.toMatchObject({ code: "forbidden" });

    // Editing: name, topic, avatar propagate to everyone.
    await a.roomAdmin.setName(room, "Renamed room");
    await a.roomAdmin.setTopic(room, "  A fresh topic ");
    await a.roomAdmin.setAvatar(room, { name: "r.png", mimeType: "image/png", size: PNG_1X1.length, data: new Blob([PNG_1X1], { type: "image/png" }) });
    await expect.poll(() => db.d && [db.d.name, db.d.topic, !!db.d.avatar], { timeout: 15000 }).toEqual(["Renamed room", "A fresh topic", true]);
    await a.roomAdmin.setTopic(room, "");
    await expect.poll(() => db.d?.topic, { timeout: 10000 }).toBeUndefined();

    // Roles: promoting bob to moderator lets him edit, but not remove the admin.
    await a.roomAdmin.setRole(room, "@bob:localhost", "moderator");
    await expect.poll(() => db.d?.myRole, { timeout: 10000 }).toBe("moderator");
    expect(db.d?.can).toMatchObject({ editInfo: true, kick: true });
    await expect.poll(() => da.d?.members.find((m) => m.userId === "@bob:localhost")?.role, { timeout: 10000 }).toBe("moderator");
    await expect(b.roomAdmin.kick(room, "@alice:localhost")).rejects.toMatchObject({ code: "forbidden" });
    await expect(b.roomAdmin.setRole(room, "@alice:localhost", "member")).rejects.toMatchObject({ code: "forbidden" });

    // Invites show as pending and can be withdrawn.
    await a.roomAdmin.invite(room, ["@test:localhost"]);
    await expect.poll(() => da.d?.members.find((m) => m.userId === "@test:localhost")?.invited, { timeout: 10000 }).toBe(true);
    await a.roomAdmin.kick(room, "@test:localhost");
    await expect.poll(() => da.d?.members.some((m) => m.userId === "@test:localhost"), { timeout: 10000 }).toBe(false);

    // Mute is reflected in the details; removing a member takes the room away from them.
    await b.rooms.setMuted(room, true);
    await expect.poll(() => db.d?.muted, { timeout: 10000 }).toBe(true);
    await b.rooms.setMuted(room, false);
    await expect.poll(() => db.d?.muted, { timeout: 10000 }).toBe(false);
    await a.roomAdmin.kick(room, "@bob:localhost");
    await expect.poll(() => bRooms.some((r) => r.id === room), { timeout: 15000 }).toBe(false);
    await a.sync.stop();
    await b.sync.stop();
  },
  120000,
);

test.skipIf(!process.env.OHMATRIX_LIVE)(
  "message search: server for open rooms, this device for encrypted rooms, per room and global",
  async () => {
    const e = new JsSdkEngine({ cryptoStorage: "memory" });
    const s = await e.auth.loginWithPassword("http://localhost:8008", "test", "123456");
    let rooms: RoomSummary[] = [];
    e.rooms.subscribe((u) => {
      rooms = applyUpdates(rooms, u);
    });
    await e.sync.start();
    const tag = `zebra${Date.now().toString(36)}`;
    const api = (path: string, body: unknown, method = "POST") =>
      fetch(`http://localhost:8008/_matrix/client/v3${path}`, {
        method,
        headers: { authorization: `Bearer ${s.accessToken}` },
        body: JSON.stringify(body),
      }).then((r) => r.json()) as Promise<Record<string, string>>;
    const open = (await api("/createRoom", { name: `Open ${tag}`, preset: "private_chat" })).room_id!;
    const secret = await e.rooms.createGroup({ name: `Secret ${tag}`, invite: [] });
    await expect.poll(() => rooms.filter((r) => [open, secret].includes(r.id)).length, { timeout: 15000 }).toBe(2);
    await api(`/rooms/${encodeURIComponent(open)}/send/m.room.message/o1`, { msgtype: "m.text", body: `the ${tag} is in the open room` }, "PUT");
    await api(`/rooms/${encodeURIComponent(open)}/send/m.room.message/o2`, { msgtype: "m.text", body: "something unrelated" }, "PUT");
    const tl = e.openTimeline(secret);
    await tl.sendText(`The ${tag.toUpperCase()} is in the secret room`);
    await expect.poll(async () => (await e.search.messages({ term: tag })).results.length, { timeout: 20000 }).toBe(2);

    const all = await e.search.messages({ term: tag });
    expect(all.results.map((r) => [r.roomName, r.local]).sort()).toEqual([
      [`Open ${tag}`, false],
      [`Secret ${tag}`, true],
    ]);
    expect(all.results[0]!.ts).toBeGreaterThanOrEqual(all.results[1]!.ts); // newest first
    expect(all.localRooms).toBeGreaterThanOrEqual(1);
    const secretHit = all.results.find((r) => r.local)!;
    expect(secretHit).toMatchObject({ roomId: secret, senderName: "test", text: `The ${tag.toUpperCase()} is in the secret room` });
    expect(secretHit.eventId).toMatch(/^\$/);

    // One room only; case does not matter; short or unknown terms find nothing.
    expect((await e.search.messages({ term: tag, roomId: open })).results.map((r) => r.roomId)).toEqual([open]);
    expect((await e.search.messages({ term: tag.toUpperCase(), roomId: secret })).results.map((r) => r.roomId)).toEqual([secret]);
    expect((await e.search.messages({ term: "x" })).results).toEqual([]);
    expect((await e.search.messages({ term: `${tag}-nothing-like-this` })).results).toEqual([]);
    tl.close();
    await e.sync.stop();
  },
  90000,
);

for (const encrypted of [false, true]) {
  test.skipIf(!process.env.OHMATRIX_LIVE)(
    `video and audio: send, voice marker and waveform, upload row, download${encrypted ? " (encrypted room)" : ""}`,
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
      if (encrypted)
        await expect
          .poll(() => (e as unknown as { client: { isRoomEncrypted(id: string): boolean } }).client.isRoomEncrypted(roomId), { timeout: 15000 })
          .toBe(true);
      const tl = e.openTimeline(roomId);
      let items: TimelineItem[] = [];
      const sawUpload = new Set<string>();
      tl.subscribe((u) => {
        items = applyUpdates(items, u);
        for (const i of items) if (i.upload) sawUpload.add(i.content.kind);
      });

      const bytes = (n: number, seed: number) => Uint8Array.from({ length: n }, (_, i) => (i * seed) & 255);
      const video = bytes(5000, 7),
        voice = bytes(3000, 11),
        song = bytes(4000, 13);
      await tl.sendAttachment({
        name: "clip.mp4",
        mimeType: "video/mp4",
        size: video.length,
        data: new Blob([video], { type: "video/mp4" }),
        durationMs: 4200,
        width: 640,
        height: 360,
      });
      await tl.sendAttachment({
        name: "voice.ogg",
        mimeType: "audio/ogg",
        size: voice.length,
        data: new Blob([voice], { type: "audio/ogg" }),
        durationMs: 7300,
        voice: true,
        waveform: [0, 0.25, 0.5, 1],
      });
      await tl.sendAttachment({
        name: "song.mp3",
        mimeType: "audio/mpeg",
        size: song.length,
        data: new Blob([song], { type: "audio/mpeg" }),
        durationMs: 180000,
      });
      await expect.poll(() => items.filter((i) => i.status === "sent" && ["video", "audio"].includes(i.content.kind)).length, { timeout: 20000 }).toBe(3);
      expect(items.some((i) => i.upload)).toBe(false); // every upload row is gone once its message exists
      expect([...sawUpload].sort()).toEqual(["audio", "video"]); // ...but each was visible while uploading

      const v = items.find((i) => i.content.kind === "video")!.content as Extract<TimelineItem["content"], { kind: "video" }>;
      const a = items.filter((i) => i.content.kind === "audio").map((i) => i.content as Extract<TimelineItem["content"], { kind: "audio" }>);
      expect(v).toMatchObject({ name: "clip.mp4", durationMs: 4200, width: 640, height: 360, mimeType: "video/mp4", size: video.length });
      expect(!!v.encryption).toBe(encrypted);
      const vo = a.find((c) => c.name === "voice.ogg")!,
        so = a.find((c) => c.name === "song.mp3")!;
      expect(vo).toMatchObject({ voice: true, durationMs: 7300 });
      expect(vo.waveform).toEqual([0, 0.25, 0.5, 1]);
      expect(so.voice).toBeUndefined();
      expect(so.durationMs).toBe(180000);
      const fetchBytes = async (c: { url: string; encryption?: unknown; mimeType?: string }) =>
        new Uint8Array(await (await fetch(await e.media.resolve(c.url, { encryption: c.encryption, mimeType: c.mimeType }))).arrayBuffer());
      expect(await fetchBytes(v)).toEqual(video);
      expect(await fetchBytes(vo)).toEqual(voice);
      expect(await fetchBytes(so)).toEqual(song);
      tl.close();
      await e.sync.stop();
    },
    90000,
  );
}

test.skipIf(!process.env.OHMATRIX_LIVE)(
  "cancelling an upload stops it, sends nothing and removes the row",
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
    const big = new Uint8Array(8 * 1024 * 1024);
    const sending = tl.sendAttachment({ name: "huge.bin", mimeType: "application/octet-stream", size: big.length, data: new Blob([big]) });
    const outcome = sending.then(
      () => "sent",
      (err: Error) => `rejected: ${err.message}`,
    );
    await expect.poll(() => items.find((i) => i.upload)?.transactionId, { timeout: 10000 }).toBeTruthy();
    tl.cancelUpload(items.find((i) => i.upload)!.transactionId!);
    expect(await outcome).toBe("rejected: cancelled");
    await expect.poll(() => items.some((i) => i.upload), { timeout: 5000 }).toBe(false);
    await new Promise((r) => setTimeout(r, 1500));
    expect(items.some((i) => i.content.kind === "file")).toBe(false); // nothing was sent
    tl.close();
    await e.sync.stop();
  },
  60000,
);
