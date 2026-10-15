import { applyUpdates, type ListUpdate, type RoomSummary, type TimelineItem } from "@ohmatrix/core";
import { expect, test } from "vitest";
import { RustEngineCore } from "./engine.js";
import type { LatestEvent, ListChange, Sdk, SdkClient, SdkRoom, SdkSession, SdkSyncService, SdkTask, SdkTimeline, TimelineEntry } from "./sdk.js";
import type { RoomInfoLike } from "./roomSummary.js";
import type { EventItemLike } from "./timelineItem.js";

// ---- a fake SDK: just enough of it for the engine to be driven the way the app drives it --------------------------------

const info = (id: string, over: Partial<RoomInfoLike> = {}): RoomInfoLike => ({
  id,
  displayName: id,
  isDirect: false,
  isSpace: false,
  isFavourite: false,
  membership: "Joined",
  joinedMembersCount: 2n,
  numUnreadNotifications: 0n,
  numUnreadMentions: 0n,
  isMarkedUnread: false,
  mutedByUser: false,
  ...over,
});
const event = (id: string, body: string, over: Partial<EventItemLike> = {}): EventItemLike => ({
  eventId: id,
  sender: "@alice:s",
  senderName: "Alice",
  isOwn: false,
  timestamp: 1000,
  content: { type: "text", body },
  ...over,
});

class FakeTimeline implements SdkTimeline {
  cb: ((c: ListChange<TimelineEntry>[]) => void) | null = null;
  sent: string[] = [];
  paginated = 0;
  read = 0;
  cancelled = false;
  async onChanges(cb: (c: ListChange<TimelineEntry>[]) => void): Promise<SdkTask> {
    this.cb = cb;
    return { cancel: () => void (this.cancelled = true) };
  }
  async paginateBackwards() {
    this.paginated++;
    return false;
  }
  async sendText(body: string) {
    this.sent.push(body);
  }
  async markRead() {
    this.read++;
  }
  push(...c: ListChange<TimelineEntry>[]) {
    this.cb?.(c);
  }
}

class FakeRoom implements SdkRoom {
  infoCb: ((i: RoomInfoLike) => void) | null = null;
  timelineObj = new FakeTimeline();
  typingSent: boolean[] = [];
  constructor(
    public roomInfo: RoomInfoLike,
    public latestEvent: LatestEvent = {},
  ) {}
  id() {
    return this.roomInfo.id;
  }
  async info() {
    return this.roomInfo;
  }
  onInfo(cb: (i: RoomInfoLike) => void): SdkTask {
    this.infoCb = cb;
    return { cancel: () => {} };
  }
  async latest() {
    return this.latestEvent;
  }
  onTyping(): SdkTask {
    return { cancel: () => {} };
  }
  async typingNotice(t: boolean) {
    this.typingSent.push(t);
  }
  async timeline() {
    return this.timelineObj;
  }
}

class FakeSync implements SdkSyncService {
  roomsCb: ((c: ListChange<SdkRoom>[]) => void) | null = null;
  stateCb: ((s: "Idle" | "Running" | "Terminated" | "Error" | "Offline") => void) | null = null;
  started = 0;
  stopped = 0;
  async start() {
    this.started++;
  }
  async stop() {
    this.stopped++;
  }
  onState(cb: (s: "Idle" | "Running" | "Terminated" | "Error" | "Offline") => void): SdkTask {
    this.stateCb = cb;
    return { cancel: () => {} };
  }
  async rooms(cb: (c: ListChange<SdkRoom>[]) => void) {
    this.roomsCb = cb;
    return { cancel: () => {}, loadMore: () => {} };
  }
}

class FakeClient implements SdkClient {
  rooms = new Map<string, FakeRoom>();
  sync = new FakeSync();
  loggedIn: [string, string, string] | null = null;
  restored: SdkSession | null = null;
  loggedOut = false;
  failLogin: unknown = null;
  userId() {
    return "@me:s";
  }
  session(): SdkSession {
    return { accessToken: "tok", userId: "@me:s", deviceId: "DEV", homeserverUrl: "http://s", slidingSyncVersion: "native" };
  }
  async login(u: string, p: string, d: string) {
    if (this.failLogin) throw this.failLogin;
    this.loggedIn = [u, p, d];
  }
  async restore(s: SdkSession) {
    this.restored = s;
  }
  async logout() {
    this.loggedOut = true;
  }
  async syncService() {
    return this.sync;
  }
  async profile() {
    return { displayName: "Me", avatarUrl: "mxc://s/me" };
  }
  room(id: string) {
    return this.rooms.get(id);
  }
}

function make() {
  const client = new FakeClient();
  const configs: unknown[] = [];
  const sdk: Sdk = {
    defaultSlidingSync: "fallback",
    async newClient(config) {
      configs.push(config);
      return client;
    },
  };
  const engine = new RustEngineCore(sdk, { dataDir: "/data", cacheDir: "/cache", passphrase: async () => "secret" });
  return { engine, client, configs };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const tickMany = async () => {
  for (let i = 0; i < 5; i++) await tick();
};

// ---- tests ----------------------------------------------------------------------------------------------------------------

test("signing in makes a client with the database paths and passphrase, and gives back a session we can store", async () => {
  const { engine, client, configs } = make();
  const session = await engine.auth.loginWithPassword("http://s", "alice", "pw");
  expect(configs[0]).toEqual({ homeserverUrl: "http://s", dataDir: "/data", cacheDir: "/cache", passphrase: "secret" });
  expect(client.loggedIn).toEqual(["alice", "pw", "OhMatrix Android"]);
  expect(session).toMatchObject({ homeserver: "http://s", userId: "@me:s", deviceId: "DEV", accessToken: "tok" });
  expect(typeof session.native).toBe("string");
});

test("a failed sign-in is an EngineError with the right code", async () => {
  const { engine, client } = make();
  client.failLogin = { tag: "MatrixApi", inner: { msg: "Invalid password", code: "M_FORBIDDEN", kind: { tag: "Forbidden" } } };
  await expect(engine.auth.loginWithPassword("http://s", "alice", "no")).rejects.toMatchObject({ name: "EngineError", code: "forbidden" });
});

test("restoring a session gives the SDK what it needs, with the stored extras", async () => {
  const { engine, client } = make();
  await engine.auth.restore({
    homeserver: "http://s",
    userId: "@me:s",
    deviceId: "DEV",
    accessToken: "tok",
    native: JSON.stringify({ slidingSyncVersion: "stored" }),
  });
  expect(client.restored).toMatchObject({ accessToken: "tok", homeserverUrl: "http://s", slidingSyncVersion: "stored" });
});

test("nothing works before signing in", async () => {
  const { engine } = make();
  await expect(engine.sync.start()).rejects.toMatchObject({ code: "unauthorized" });
  expect(() => engine.openTimeline("!r:s")).toThrow(/not signed in/);
});

test("the profile arrives after signing in, and is null after signing out", async () => {
  const { engine } = make();
  const seen: (string | null)[] = [];
  engine.profile.subscribe((p) => seen.push(p?.displayName ?? null));
  await engine.auth.loginWithPassword("http://s", "alice", "pw");
  await tickMany();
  expect(seen).toEqual([null, "Me"]);
  await engine.auth.logout();
  expect(seen.at(-1)).toBeNull();
});

test("the sync state is ours: connecting, syncing, error, stopped", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  const seen: string[] = [];
  engine.sync.onState((s) => seen.push(s));
  await engine.sync.start();
  expect(client.sync.started).toBe(1);
  for (const s of ["Offline", "Running", "Error", "Terminated"] as const) client.sync.stateCb!(s);
  expect(seen).toEqual(["stopped", "connecting", "syncing", "error", "stopped"]);
});

test("the chat list: invitations first, then pinned, then by recent activity; rooms that change are updated", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  const rooms = ["old", "new", "pin", "inv"].map((id, i) => {
    const r = new FakeRoom(
      info(`!${id}`, {
        displayName: id,
        isFavourite: id === "pin",
        membership: id === "inv" ? "Invited" : "Joined",
        inviter: id === "inv" ? { userId: "@bob:s" } : undefined,
      }),
      { item: event(`$${id}`, `msg ${id}`, { timestamp: [1, 9, 0, 0][i]! }) },
    );
    client.rooms.set(r.id(), r);
    return r;
  });
  let list: RoomSummary[] = [];
  engine.rooms.subscribe((u) => (list = applyUpdates(list, u)));
  await engine.sync.start();
  client.sync.roomsCb!([{ tag: "Reset", inner: { values: rooms } }]);
  await tickMany();
  expect(list.map((r) => r.name)).toEqual(["inv", "pin", "new", "old"]);
  expect(list[0]!.invite).toEqual({ inviter: "bob" });
  expect(list[3]!.lastMessage?.content).toEqual({ kind: "text", body: "msg old" });

  // A room's info changes (someone wrote, it was read): its row is made again, the others are the very same objects.
  const before = [...list];
  const oldRoom = rooms[0]!;
  oldRoom.roomInfo = info("!old", { displayName: "old", numUnreadNotifications: 3n });
  oldRoom.infoCb!(oldRoom.roomInfo);
  await tickMany();
  const old = list.find((r) => r.id === "!old")!;
  expect(old.unreadCount).toBe(3);
  for (const r of before.filter((x) => x.id !== "!old")) expect(list.find((x) => x.id === r.id)).toBe(r);
});

test("a room that is left is no longer listed", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  const r = new FakeRoom(info("!x"));
  client.rooms.set("!x", r);
  let list: RoomSummary[] = [];
  engine.rooms.subscribe((u) => (list = applyUpdates(list, u)));
  await engine.sync.start();
  client.sync.roomsCb!([{ tag: "Reset", inner: { values: [r] } }]);
  await tickMany();
  expect(list).toHaveLength(1);
  r.roomInfo = info("!x", { membership: "Left" });
  r.infoCb!(r.roomInfo);
  await tickMany();
  expect(list).toHaveLength(0);
});

test("a timeline shows the events and not the dividers the SDK puts between them; new ones arrive as changes", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  const room = new FakeRoom(info("!r"));
  client.rooms.set("!r", room);
  const tl = engine.openTimeline("!r");
  let items: TimelineItem[] = [];
  const batches: ListUpdate<TimelineItem>[][] = [];
  tl.subscribe((u) => {
    batches.push(u);
    items = applyUpdates(items, u);
  });
  await tickMany();
  room.timelineObj.push({ tag: "Reset", inner: { values: [{}, { event: event("$1", "one") }, { event: event("$2", "two") }] } });
  expect(items.map((i) => (i.content.kind === "text" ? i.content.body : ""))).toEqual(["one", "two"]);
  // One more arrives at the end, behind a divider.
  room.timelineObj.push({ tag: "PushBack", inner: { value: {} } }, { tag: "PushBack", inner: { value: { event: event("$3", "three") } } });
  expect(items.map((i) => i.id)).toEqual(["$1", "$2", "$3"]);
  expect(batches.at(-1)).toEqual([{ op: "insert", index: 2, item: expect.objectContaining({ id: "$3" }) }]);
  // An event is edited in place: one change, not a whole new list.
  // (The SDK's list is [divider, $1, $2, divider, $3]: $3 is at 4, and the engine's index for it is 2.)
  room.timelineObj.push({ tag: "Set", inner: { index: 4, value: { event: event("$3", "three!") } } });
  expect(batches.at(-1)).toEqual([{ op: "set", index: 2, item: expect.objectContaining({ id: "$3" }) }]);
  tl.close();
});

test("sending, reading older messages and marking read go to the SDK's timeline; typing goes to the room", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  const room = new FakeRoom(info("!r"));
  client.rooms.set("!r", room);
  const tl = engine.openTimeline("!r");
  await tl.sendText("hello");
  await tl.paginateBackwards();
  await tl.markRead();
  tl.setTyping(true);
  await tickMany();
  expect(room.timelineObj.sent).toEqual(["hello"]);
  expect(room.timelineObj.paginated).toBe(1);
  expect(room.timelineObj.read).toBe(1);
  expect(room.typingSent).toEqual([true]);
  tl.close();
  await tickMany();
  expect(room.timelineObj.cancelled).toBe(true);
});

test("what is not implemented yet fails as unsupported, and what the app asks for at start does not fail", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  await expect(engine.auth.register("http://s", "x", "y")).rejects.toMatchObject({ code: "unsupported" });
  await expect(engine.search.messages({ term: "x" })).rejects.toMatchObject({ code: "unsupported" });
  await expect(engine.roomAdmin.setName("!r", "x")).rejects.toMatchObject({ code: "unsupported" });
  client.rooms.set("!r", new FakeRoom(info("!r")));
  await expect(engine.openTimeline("!r").edit("$1", "x")).rejects.toMatchObject({ code: "unsupported" });
  expect(await engine.security.state()).toBe("unavailable");
  expect(() => engine.notifications.subscribe(() => {})()).not.toThrow();
  expect(() => engine.rooms.subscribeDetails("!r", () => {})()).not.toThrow();
});

test("signing out stops sync, signs the client out, forgets the rooms, and the next sign-in starts clean", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  await engine.sync.start();
  let list: RoomSummary[] = [new FakeRoom(info("!z")) as never];
  engine.rooms.subscribe((u) => (list = applyUpdates(list, u)));
  await engine.auth.logout();
  expect(client.sync.stopped).toBe(1);
  expect(client.loggedOut).toBe(true);
  expect(list).toEqual([]);
  await expect(engine.sync.start()).rejects.toMatchObject({ code: "unauthorized" });
});
