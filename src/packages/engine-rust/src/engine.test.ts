import { applyUpdates, EngineError, type ListUpdate, type RoomSummary, type TimelineItem } from "@ohmatrix/core";
import { expect, test } from "vitest";
import { RustEngineCore, type RustEngineOptions } from "./engine.js";
import type {
  LatestEvent,
  RawHit,
  RawLevels,
  RawRoomDetails,
  ListChange,
  Sdk,
  SdkClient,
  SdkRoom,
  SdkSession,
  SdkSyncService,
  SdkTask,
  SdkTimeline,
  TimelineEntry,
} from "./sdk.js";
import type { RoomInfoLike } from "./roomSummary.js";

const KEY = new Uint8Array(32).fill(7).buffer;
import type { RawSecurity } from "./security.js";
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
  /** What each `paginateBackwards` brings: the batches of changes to push, then the room's start. */
  older: ListChange<TimelineEntry>[][] = [];
  atStart = false;
  async paginateBackwards() {
    this.paginated++;
    const batch = this.older.shift();
    if (batch) this.cb?.(batch);
    return this.atStart && this.older.length === 0;
  }
  items = new Map<string, EventItemLike>();
  async item(id: string) {
    const e = this.items.get(id);
    if (!e) throw new Error("no such event");
    return e;
  }
  async sendMedia(f: unknown) {
    this.calls.push(["sendMedia", f]);
  }
  async sendText(body: string, mentions?: string[]) {
    this.sent.push(body);
    if (mentions) this.calls.push(["mentions", mentions]);
  }
  calls: unknown[][] = [];
  private record =
    (name: string) =>
    async (...args: unknown[]) =>
      void this.calls.push([name, ...args]);
  reply = this.record("reply");
  edit = this.record("edit");
  redact = this.record("redact");
  react = this.record("react");
  pin = this.record("pin");
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
  // ---- chat info and administration: what was asked is written down, the details are what the test sets ----
  calls: unknown[][] = [];
  detailsNow: RawRoomDetails = {
    id: "!r",
    name: "Room",
    alternativeAliases: [],
    historyVisibility: "Shared",
    isDirect: false,
    isEncrypted: false,
    muted: false,
    pinnedEventIds: [],
    me: "@me:s",
    members: [{ userId: "@me:s", membership: "Join", power: 100 }],
    levels: { invite: 0, kick: 50, ban: 50, redact: 50, eventsDefault: 0, stateDefault: 50 },
    can: { invite: true, kick: true, ban: true, pin: true, editName: true, editTopic: true, joinRules: true, history: true, levels: true },
  };
  async details(_opts?: { people?: boolean }) {
    return this.detailsNow;
  }
  private record =
    (name: string) =>
    async (...args: unknown[]) =>
      void this.calls.push([name, ...args]);
  leave = this.record("leave");
  setName = this.record("setName");
  setTopic = this.record("setTopic");
  invite = this.record("invite");
  kick = this.record("kick");
  ban = this.record("ban");
  unban = this.record("unban");
  setPower = this.record("setPower");
  setLevels = this.record("setLevels") as (p: Partial<RawLevels>) => Promise<void>;
  setJoinRule = this.record("setJoinRule");
  setHistoryVisibility = this.record("setHistoryVisibility");
  setAvatar = this.record("setAvatar");
  sendRaw = this.record("sendRaw");
  join = this.record("join");
  markRead = this.record("markRead");
  setFavourite = this.record("setFavourite");
  setUnreadFlag = this.record("setUnreadFlag");
  retrySending = this.record("retrySending");
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
  made: unknown[] = [];
  dm = new Map<string, string>();
  directory: { userId: string; displayName?: string }[] = [];
  profiles = new Map<string, { userId: string; displayName?: string }>();
  async createRoom(o: unknown) {
    this.made.push(o);
    return "!new:s";
  }
  async joinRoom(id: string) {
    this.made.push(["join", id]);
    return "!joined:s";
  }
  directRoom(u: string) {
    return this.dm.get(u);
  }
  ignored: string[] = [];
  async ignoreUser(u: string) {
    this.ignored.push(u);
  }
  async searchUsers() {
    return this.directory;
  }
  async userProfile(u: string) {
    const p = this.profiles.get(u);
    if (!p) throw new Error("no such user");
    return p;
  }
  secure: RawSecurity = { recovery: "Unknown", verified: undefined, backupOnServer: false };
  secureCb: (() => void) | null = null;
  secureCalls: unknown[][] = [];
  security() {
    return {
      read: async () => this.secure,
      onChange: (cb: () => void): SdkTask => {
        this.secureCb = cb;
        return { cancel: () => void (this.secureCb = null) };
      },
      setUp: async (password: string) => {
        this.secureCalls.push(["setUp", password]);
        return "EsTc 1234";
      },
      recover: async (key: string) => void this.secureCalls.push(["recover", key]),
    };
  }
  avatars: unknown[][] = [];
  async setAvatar(mime: string, data: ArrayBuffer) {
    this.avatars.push([mime, data.byteLength]);
  }
  urls: unknown[][] = [];
  failUrl = false;
  async mediaUrl(mxc: string, o: unknown) {
    this.urls.push([mxc, o]);
    if (this.failUrl) throw new Error("offline");
    return `file:///cache/${this.urls.length}`;
  }
  /** Batches a search gives, one per `next()`. */
  hits: RawHit[][] = [];
  searched: unknown[][] = [];
  search(term: string, roomId?: string) {
    this.searched.push([term, roomId]);
    const batches = [...this.hits];
    return { next: async () => batches.shift() };
  }
  names: string[] = [];
  async setDisplayName(n: string) {
    this.names.push(n);
  }
  muted: [string, boolean][] = [];
  async setMuted(id: string, m: boolean) {
    this.muted.push([id, m]);
  }
  pushers: unknown[] = [];
  async setPusher(p: unknown) {
    this.pushers.push(p);
  }
  removedPushers: unknown[] = [];
  async deletePusher(p: unknown) {
    this.removedPushers.push(p);
  }
}

function make(fetch?: RustEngineOptions["fetch"]) {
  const client = new FakeClient();
  const configs: unknown[] = [];
  const sdk: Sdk = {
    defaultSlidingSync: "fallback",
    async newClient(config) {
      configs.push(config);
      return client;
    },
  };
  const engine = new RustEngineCore(sdk, {
    dataDir: "/data",
    cacheDir: "/cache",
    key: async () => KEY,
    roomWaitMs: 30,
    fetch: fetch ?? (async () => ({ ok: true, status: 200, json: async () => ({}) })),
  });
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
  expect(configs[0]).toEqual({ homeserverUrl: "http://s", dataDir: "/data", cacheDir: "/cache", key: KEY, restoring: false });
  expect(client.loggedIn).toEqual(["alice", "pw", "OhMatrix Android"]);
  expect(session).toMatchObject({ homeserver: "http://s", userId: "@me:s", deviceId: "DEV", accessToken: "tok" });
  expect(typeof session.native).toBe("string");
});

test("a bare server name is signed in to over https, after its .well-known; http only when typed", async () => {
  const asked: string[] = [];
  const fetch: RustEngineOptions["fetch"] = async (url) => {
    asked.push(url);
    return url.startsWith("https://example.org/")
      ? { ok: true, status: 200, json: async () => ({ "m.homeserver": { base_url: "https://matrix.example.org/" } }) }
      : { ok: false, status: 404, json: async () => ({}) };
  };
  const urlFor = async (typed: string) => {
    const { engine, configs } = make(fetch);
    await engine.auth.loginWithPassword(typed, "alice", "pw");
    return (configs[0] as { homeserverUrl: string } | undefined)?.homeserverUrl;
  };
  expect(await urlFor("example.org")).toBe("https://matrix.example.org");
  expect(await urlFor("no-wellknown.example")).toBe("https://no-wellknown.example"); // none published: the name itself, over https
  expect(await urlFor("localhost:8008")).toBe("https://localhost:8008"); // not assumed to be http either
  expect(await urlFor("http://s")).toBe("http://s");
  expect(asked.filter((u) => u.includes(".well-known") && !u.includes("localhost"))).toEqual([
    "https://example.org/.well-known/matrix/client",
    "https://no-wellknown.example/.well-known/matrix/client",
  ]);
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

test("restoring builds the client without asking the server (the app may be opened offline)", async () => {
  const { engine, configs } = make();
  await engine.auth.restore({ homeserver: "http://s", userId: "@me:s", deviceId: "DEV", accessToken: "tok" });
  expect(configs[0]).toMatchObject({ restoring: true });
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

test("what the app asks for at start does not fail", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  client.rooms.set("!r", new FakeRoom(info("!r")));
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

test("the chat info is read when subscribed and again when the room changes, one read at a time", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  const room = new FakeRoom(info("!r"));
  client.rooms.set("!r", room);
  const seen: string[] = [];
  const stop = engine.rooms.subscribeDetails("!r", (d) => seen.push(d.name));
  await tickMany();
  expect(seen).toEqual(["Room", "Room"]); // the basics, then the same with the people
  room.detailsNow = { ...room.detailsNow, name: "Renamed" };
  room.infoCb?.(info("!r"));
  await tickMany();
  expect(seen).toEqual(["Room", "Room", "Renamed"]); // a change does not send the people-less version again
  stop();
  room.infoCb?.(info("!r"));
  await tickMany();
  expect(seen).toHaveLength(3);
});

test("the chat info goes out at once without the people, which follow when they have been read", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  const room = new FakeRoom(info("!r"));
  const person = { userId: "@a:s", displayName: "Ann", power: 0, membership: "Join" as const };
  room.detailsNow = { ...room.detailsNow, members: [person] };
  client.rooms.set("!r", room);
  // The people take as long as they take: the full read does not finish until it is let.
  let finish!: () => void;
  const finished = new Promise<void>((r) => (finish = r));
  const asked: Array<{ people?: boolean } | undefined> = [];
  const original = room.details.bind(room);
  room.details = async (opts) => {
    asked.push(opts);
    if (opts?.people !== false) await finished;
    return original();
  };
  const seen: Array<{ loading: boolean; people: number }> = [];
  const stop = engine.rooms.subscribeDetails("!r", (d) => seen.push({ loading: !!d.peopleLoading, people: d.members.length }));
  await tickMany();
  expect(seen).toEqual([{ loading: true, people: 0 }]); // out already, with nobody yet
  expect(asked[0]).toEqual({ people: false });
  finish();
  await tickMany();
  expect(seen).toEqual([
    { loading: true, people: 0 },
    { loading: false, people: 1 },
  ]);
  stop();
});

test("subscribing to an unknown room fails as not found", async () => {
  const { engine } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  expect(() => engine.rooms.subscribeDetails("!nope", () => {})).toThrowError(expect.objectContaining({ code: "not_found" }));
});

test("administration goes to the room: names, people, roles, levels, rules", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  const room = new FakeRoom(info("!r"));
  client.rooms.set("!r", room);
  const a = engine.roomAdmin;
  await a.setName("!r", "N");
  await a.setTopic("!r", "T");
  await a.invite("!r", ["@x:s", "@y:s"]);
  await a.kick("!r", "@x:s");
  await a.ban("!r", "@y:s", "spam");
  await a.unban("!r", "@y:s");
  await a.setRole("!r", "@x:s", "moderator");
  await a.setRole("!r", "@x:s", "admin");
  await a.setRole("!r", "@x:s", "member");
  await a.setPower("!r", "@x:s", 25);
  await a.setThresholds("!r", { kick: 60, sendMessages: 10, changeSettings: 70 });
  await a.setJoinRule("!r", "public");
  await a.setHistoryVisibility("!r", "joined");
  await engine.rooms.leave("!r");
  expect(room.calls).toEqual([
    ["setName", "N"],
    ["setTopic", "T"],
    ["invite", "@x:s"],
    ["invite", "@y:s"],
    ["kick", "@x:s"],
    ["ban", "@y:s", "spam"],
    ["unban", "@y:s"],
    ["setPower", "@x:s", 50],
    ["setPower", "@x:s", 100],
    ["setPower", "@x:s", 0],
    ["setPower", "@x:s", 25],
    ["setLevels", { kick: 60, eventsDefault: 10, stateDefault: 70 }],
    ["setJoinRule", "public"],
    ["setHistoryVisibility", "joined"],
    ["leave"],
  ]);
  await engine.rooms.setMuted("!r", true);
  expect(client.muted).toEqual([["!r", true]]);
  await expect(a.setName("!nope", "x")).rejects.toMatchObject({ code: "not_found" });
});

test("push: a pusher is registered with the gateway and taken away again; the SDK's errors are ours", async () => {
  const { engine, client } = make();
  await engine.auth.restore({ homeserver: "http://s", userId: "@me:s", deviceId: "DEV", accessToken: "tok" });
  const reg = {
    appId: "org.ohmatrix.app",
    pushKey: "token-1",
    gatewayUrl: "https://push.example/_matrix/push/v1/notify",
    appName: "OhMatrix",
    deviceName: "Phone",
    lang: "en",
  };
  await engine.notifications.registerPush(reg);
  expect(client.pushers).toEqual([reg]);
  await engine.notifications.unregisterPush({ appId: reg.appId, pushKey: reg.pushKey });
  expect(client.removedPushers).toEqual([{ appId: reg.appId, pushKey: reg.pushKey }]);
  client.setPusher = async () => {
    throw new Error("M_FORBIDDEN");
  };
  await expect(engine.notifications.registerPush(reg)).rejects.toBeInstanceOf(EngineError);
});

test("message operations go to the SDK's timeline; a message still on its way is addressed by its transaction id", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  const room = new FakeRoom(info("!r"));
  client.rooms.set("!r", room);
  const tl = engine.openTimeline("!r");
  tl.subscribe(() => {});
  await tickMany();
  room.timelineObj.push({
    tag: "Reset",
    inner: {
      values: [
        { event: event("$1", "one", { isOwn: true }) },
        { event: event("local", "two", { eventId: undefined, transactionId: "txn1", isOwn: true, sendState: "SendingFailed" }) },
      ],
    },
  });
  await tl.sendText("hi @bob", ["@bob:s"]);
  await tl.reply("$1", "answer");
  await tl.edit("$1", "fixed");
  await tl.redact("$1");
  await tl.react("$1", "👍");
  await tl.pin("$1", true);
  await tl.edit("txn1", "again");
  await tl.resend("txn1");
  tl.discard("txn1");
  await tickMany();
  expect(room.timelineObj.calls).toEqual([
    ["mentions", ["@bob:s"]],
    ["reply", "$1", "answer", undefined],
    ["edit", { eventId: "$1" }, "fixed"],
    ["redact", { eventId: "$1" }],
    ["react", { eventId: "$1" }, "👍"],
    ["pin", "$1", true],
    ["edit", { transactionId: "txn1" }, "again"],
    ["redact", { transactionId: "txn1" }],
  ]);
  expect(room.calls).toEqual([["retrySending"]]);
});

test("room operations: accept, decline, favourite, unread, read", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  const room = new FakeRoom(info("!r"));
  client.rooms.set("!r", room);
  await engine.rooms.acceptInvite("!r");
  await engine.rooms.declineInvite("!r");
  await engine.rooms.setPinned("!r", true);
  await engine.rooms.setMarkedUnread("!r", true);
  await engine.rooms.markRead("!r");
  expect(room.calls).toEqual([["join"], ["leave"], ["setFavourite", true], ["setUnreadFlag", true], ["markRead"]]);
});

test("making chats, groups and spaces, and joining; a chat that exists is reused", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  client.dm.set("@old:s", "!dm:s");
  expect(await engine.rooms.createDirect("@old:s")).toBe("!dm:s");
  expect(await engine.rooms.createDirect("@new:s")).toBe("!new:s");
  await engine.rooms.createGroup({ name: "G", invite: ["@x:s"] });
  await engine.rooms.createSpace({ name: "S", topic: "t" });
  expect(await engine.rooms.joinRoom(" #r:s ")).toBe("!joined:s");
  expect(client.made).toEqual([
    { name: "", invite: ["@new:s"], encrypted: true, space: false, direct: true },
    { name: "G", invite: ["@x:s"], encrypted: true, space: false, direct: false },
    { name: "S", topic: "t", invite: [], encrypted: false, space: true, direct: false },
    ["join", "#r:s"],
  ]);
});

test("finding people: the directory without me, and a complete user id that is not listed is looked up", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  client.directory = [{ userId: "@me:s" }, { userId: "@al:s", displayName: "Al" }, { userId: "@bo:s" }];
  expect(await engine.users.search("a")).toEqual([
    { userId: "@al:s", displayName: "Al" },
    { userId: "@bo:s", displayName: "bo" },
  ]);
  client.profiles.set("@far:o", { userId: "@far:o", displayName: "Far" });
  expect(await engine.users.search("@far:o")).toEqual([{ userId: "@far:o", displayName: "Far" }, expect.anything(), expect.anything()]);
  expect(await engine.users.search("@ghost:o")).toHaveLength(2);
  expect(await engine.users.search("  ")).toEqual([]);
});

test("changing my name refreshes the profile", async () => {
  const { engine, client } = make();
  const seen: (string | null)[] = [];
  engine.profile.subscribe((p) => seen.push(p?.displayName ?? null));
  await engine.auth.loginWithPassword("http://s", "a", "p");
  await engine.profile.setDisplayName("New");
  expect(client.names).toEqual(["New"]);
  expect(seen.at(-1)).toBe("Me");
});

test("a picture is fetched once however often it is asked for, and a failure is not kept", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  const [a, b] = await Promise.all([
    engine.media.resolve("mxc://s/i", { width: 64, height: 64 }),
    engine.media.resolve("mxc://s/i", { width: 64, height: 64 }),
  ]);
  expect(a).toBe(b);
  await engine.media.resolve("mxc://s/i");
  await engine.media.resolve("mxc://s/e", { encryption: '{"key":{}}', mimeType: "image/png" });
  expect(client.urls).toEqual([
    ["mxc://s/i", { width: 64, height: 64 }],
    ["mxc://s/i", {}],
    ["mxc://s/e", { source: '{"key":{}}', mimeType: "image/png" }],
  ]);
  client.failUrl = true;
  await expect(engine.media.resolve("mxc://s/x")).rejects.toBeDefined();
  client.failUrl = false;
  await expect(engine.media.resolve("mxc://s/x")).resolves.toMatch(/^file:/);
});

test("the gallery reads back until a page is full, newest first, and tells where the next one starts", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  const room = new FakeRoom(info("!r"));
  client.rooms.set("!r", room);
  const image = (id: string): ListChange<TimelineEntry> => ({
    tag: "PushFront",
    inner: { value: { event: { ...event(id, id), content: { type: "image", url: `mxc://s/${id}`, body: id } } } },
  });
  const text = (id: string): ListChange<TimelineEntry> => ({ tag: "PushFront", inner: { value: { event: event(id, id) } } });
  // The room has five pictures between texts; each read brings two events, the newest first.
  room.timelineObj.older = [
    [image("$1"), text("$t1")],
    [image("$2"), image("$3")],
    [text("$t2"), image("$4")],
    [image("$5"), text("$t3")],
  ];
  room.timelineObj.atStart = true;
  const first = await engine.media.sharedPage("!r", { kind: "image", want: 2 });
  expect(first.items.map((i) => i.id)).toEqual(["$1", "$2"]);
  expect(first.next).toBeDefined();
  const second = await engine.media.sharedPage("!r", { kind: "image", want: 2, ...(first.next && { from: first.next }) });
  expect(second.items.map((i) => i.id)).toEqual(["$3", "$4"]);
  const last = await engine.media.sharedPage("!r", { kind: "image", want: 2, ...(second.next && { from: second.next }) });
  expect(last.items.map((i) => i.id)).toEqual(["$5"]);
  expect(last.next).toBeUndefined();
  expect((await engine.media.sharedPage("!r", { kind: "video" })).items).toEqual([]);
});

test("files are sent from their path with what the app knows of them; a profile picture is read from the device", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  const room = new FakeRoom(info("!r"));
  client.rooms.set("!r", room);
  const tl = engine.openTimeline("!r");
  await tl.sendAttachment({ name: "a.png", mimeType: "image/png", size: 10, data: "file:///data/a%20b.png", width: 4, height: 3 });
  await tl.sendAttachment({ name: "v.ogg", mimeType: "audio/ogg", size: 5, data: "/data/v.ogg", durationMs: 2000, waveform: [0.5], voice: true });
  expect(room.timelineObj.calls).toEqual([
    ["sendMedia", { kind: "image", path: "/data/a b.png", name: "a.png", mimeType: "image/png", size: 10, width: 4, height: 3 }],
    ["sendMedia", { kind: "audio", path: "/data/v.ogg", name: "v.ogg", mimeType: "audio/ogg", size: 5, durationMs: 2000, waveform: [0.5], voice: true }],
  ]);
  // Without a way to read the device's files, a picture cannot be set; with one, it is.
  await expect(engine.profile.setAvatar({ name: "p", mimeType: "image/png", size: 3, data: "/x" })).rejects.toMatchObject({ code: "unsupported" });
  const read = make();
  const withFiles = new RustEngineCore(
    { defaultSlidingSync: "x", newClient: async () => read.client },
    {
      dataDir: "/d",
      cacheDir: "/c",
      key: async () => KEY,
      readFile: async () => new Uint8Array([1, 2, 3]).buffer,
      fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    },
  );
  await withFiles.auth.loginWithPassword("http://s", "a", "p");
  read.client.rooms.set("!r", room);
  await withFiles.profile.setAvatar({ name: "p", mimeType: "image/png", size: 3, data: "/x" });
  await withFiles.roomAdmin.setAvatar("!r", { name: "p", mimeType: "image/jpeg", size: 3, data: "/x" });
  expect(read.client.avatars).toEqual([["image/png", 3]]);
  expect(room.calls).toEqual([["setAvatar", "image/jpeg", expect.any(ArrayBuffer)]]);
});

test("forwarding sends the message's content to the other room", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  const from = new FakeRoom(info("!a"));
  const to = new FakeRoom(info("!b"));
  client.rooms.set("!a", from);
  client.rooms.set("!b", to);
  from.timelineObj.items.set("$1", event("$1", "hello"));
  await engine.messages.forward({ fromRoomId: "!a", eventId: "$1", toRoomId: "!b" });
  expect(to.calls).toEqual([["sendRaw", "m.room.message", JSON.stringify({ msgtype: "m.text", body: "hello" })]]);
  await expect(engine.messages.forward({ fromRoomId: "!a", eventId: "$nope", toRoomId: "!b" })).rejects.toBeDefined();
});

test("searching: batches page through one search, rooms are named, an unknown page is empty", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  const hit = (id: string): RawHit => ({ roomId: "!r", eventId: id, sender: "@al:s", senderName: "Al", ts: 5, text: `found ${id}` });
  client.hits = [[hit("$1"), hit("$2")], [hit("$3")]];
  const one = await engine.search.messages({ term: " cat " });
  expect(client.searched).toEqual([["cat", undefined]]);
  expect(one.results.map((r) => r.eventId)).toEqual(["$1", "$2"]);
  expect(one.results[0]).toMatchObject({ roomName: "!r", senderName: "Al", text: "found $1", local: false });
  const two = await engine.search.messages({ term: "cat", ...(one.next && { from: one.next }) });
  expect(two.results.map((r) => r.eventId)).toEqual(["$3"]);
  const end = await engine.search.messages({ term: "cat", ...(two.next && { from: two.next }) });
  expect(end.results).toEqual([]);
  expect(end.next).toBeUndefined();
  expect(client.searched).toHaveLength(1);
  expect((await engine.search.messages({ term: "cat", from: "nope" })).results).toEqual([]);
  await engine.search.messages({ term: "cat", roomId: "!r" });
  expect(client.searched.at(-1)).toEqual(["cat", "!r"]);
});

/** A homeserver for the requests the SDK has no call for: what was asked, and a reply per kind of request. */
function server(replies: { hierarchy?: unknown; devices?: unknown } = {}) {
  const asked: { url: string; method: string; body: unknown }[] = [];
  const fetch: RustEngineOptions["fetch"] = async (url, init) => {
    asked.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : undefined });
    const body = url.includes("/hierarchy") ? replies.hierarchy : url.endsWith("/devices") ? replies.devices : {};
    return { ok: true, status: 200, json: async () => body };
  };
  return { fetch, asked };
}

test("a space lists its children with my own names and counts, and changes to it are written to its state", async () => {
  const hierarchy = {
    rooms: [
      {
        room_id: "!s",
        children_state: [
          { state_key: "!a", content: { order: "1", via: ["s"] } },
          { state_key: "!far", content: { order: "2", via: ["o"] } },
        ],
      },
      { room_id: "!far", name: "Far room" },
    ],
  };
  const { fetch, asked } = server({ hierarchy });
  const { engine, client } = make(fetch);
  await engine.auth.loginWithPassword("http://s", "a", "p");
  const sync = client.sync;
  await engine.sync.start();
  const roomA = new FakeRoom(info("!a", { displayName: "Mine A", numUnreadNotifications: 3n }));
  const roomB = new FakeRoom(info("!b", { displayName: "Not in the space" }));
  const dm = new FakeRoom(info("!dm", { isDirect: true }));
  for (const r of [roomA, roomB, dm]) client.rooms.set(r.id(), r);
  sync.roomsCb?.([{ tag: "Reset", inner: { values: [roomA, roomB, dm] } }]);
  await tickMany();
  expect(await engine.spaces.children("!s")).toEqual([
    { roomId: "!a", name: "Mine A", isSpace: false, unreadCount: 3, highlightCount: 0 },
    { roomId: "!far", name: "Far room", isSpace: false, via: ["o"], unreadCount: 0, highlightCount: 0 },
  ]);
  expect((await engine.spaces.candidates("!s")).map((c) => c.roomId)).toEqual(["!b"]);
  asked.length = 0;
  await engine.spaces.addChild("!s", "!b");
  await engine.spaces.removeChild("!s", "!a");
  await engine.spaces.moveChild("!s", "!a", "last");
  expect(asked.filter((a) => a.method === "PUT").map((a) => [decodeURIComponent(a.url.split("/rooms/")[1] ?? ""), a.body])).toEqual([
    ["!s/state/m.space.child/!b", { order: "3", via: ["s"] }],
    ["!b/state/m.space.parent/!s", { via: ["s"] }],
    ["!s/state/m.space.child/!a", {}],
    ["!a/state/m.space.parent/!s", {}],
    ["!s/state/m.space.child/!a", { order: "3", via: ["s"] }],
  ]);
});

test("a page open on a space is updated when the list of chats changes, and stops after it is closed", async () => {
  const { fetch } = server({ hierarchy: { rooms: [{ room_id: "!s", children_state: [{ state_key: "!a", content: { via: ["s"] } }] }] } });
  const { engine, client } = make(fetch);
  await engine.auth.loginWithPassword("http://s", "a", "p");
  await engine.sync.start();
  const seen: string[][] = [];
  const stop = engine.spaces.subscribe("!s", (kids) => seen.push(kids.map((k) => k.name)));
  await tickMany();
  expect(seen).toEqual([["!a"]]);
  const room = new FakeRoom(info("!a", { displayName: "Named" }));
  client.rooms.set("!a", room);
  client.sync.roomsCb?.([{ tag: "Reset", inner: { values: [room] } }]);
  await tickMany();
  expect(seen.at(-1)).toEqual(["Named"]);
  stop();
  const n = seen.length;
  client.sync.roomsCb?.([{ tag: "Reset", inner: { values: [] } }]);
  await tickMany();
  expect(seen).toHaveLength(n);
});

test("sessions are listed and signed out through the homeserver", async () => {
  const { fetch, asked } = server({
    devices: {
      devices: [
        { device_id: "DEV", display_name: "This" },
        { device_id: "OLD", last_seen_ts: 3 },
      ],
    },
  });
  const { engine } = make(fetch);
  await engine.auth.loginWithPassword("http://s", "a", "p");
  expect((await engine.devices.list()).map((d) => [d.id, d.current])).toEqual([
    ["DEV", true],
    ["OLD", false],
  ]);
  await engine.devices.remove(["OLD"], "pw");
  expect(asked.at(-1)).toMatchObject({ method: "POST", body: { devices: ["OLD"] } });
});

test("a new unread message is told of once, unless the room is muted or it is the first look at the room", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  await engine.sync.start();
  const told: string[] = [];
  engine.notifications.subscribe((n) => told.push(`${n.roomName}:${n.senderName}:${n.preview ?? ""}:${n.highlight}`));
  const room = new FakeRoom(info("!r", { displayName: "Chat", numUnreadNotifications: 2n }), { item: event("$1", "first") });
  client.rooms.set("!r", room);
  client.sync.roomsCb?.([{ tag: "Reset", inner: { values: [room] } }]);
  await tickMany();
  expect(told).toEqual([]);
  room.roomInfo = info("!r", { displayName: "Chat", numUnreadNotifications: 3n, numUnreadMentions: 1n });
  room.latestEvent = { item: event("$2", "second") };
  room.infoCb?.(room.roomInfo);
  await tickMany();
  expect(told).toEqual(["Chat:Alice:second:true"]);
  room.roomInfo = info("!r", { displayName: "Chat", numUnreadNotifications: 1n });
  room.infoCb?.(room.roomInfo);
  await tickMany();
  room.roomInfo = info("!r", { displayName: "Chat", numUnreadNotifications: 5n, mutedByUser: true });
  room.infoCb?.(room.roomInfo);
  await tickMany();
  expect(told).toHaveLength(1);
});

test("the encryption state follows the client that signs in later, and goes back to unavailable on sign-out", async () => {
  const { engine, client } = make();
  const seen: string[] = [];
  // The app subscribes before anyone has signed in.
  const stop = engine.security.onState((s) => seen.push(s));
  expect(seen).toEqual(["unavailable"]);
  client.secure = { recovery: "Enabled", verified: false, backupOnServer: true };
  await engine.auth.loginWithPassword("http://s", "a", "p");
  await tickMany();
  expect(seen).toEqual(["unavailable", "needs_recovery"]);
  client.secure = { recovery: "Enabled", verified: true, backupOnServer: true };
  client.secureCb?.();
  client.secureCb?.();
  await tickMany();
  expect(seen).toEqual(["unavailable", "needs_recovery", "ready"]);
  expect(await engine.security.state()).toBe("ready");
  expect(await engine.security.setUp({ password: "pw" })).toEqual({ recoveryKey: "EsTc 1234" });
  await engine.security.restoreWithRecoveryKey("  key  ");
  expect(client.secureCalls).toEqual([
    ["setUp", "pw"],
    ["recover", "key"],
  ]);
  await engine.auth.logout();
  expect(seen.at(-1)).toBe("unavailable");
  expect(client.secureCb).toBeNull();
  stop();
});

test("a room just made or joined is handed on only once the chat list has it, so it opens with its name", async () => {
  const { engine, client } = make();
  await engine.auth.loginWithPassword("http://s", "a", "p");
  await engine.sync.start();
  const room = new FakeRoom(info("!joined:s", { displayName: "Joined" }));
  client.rooms.set("!joined:s", room);
  // The room arrives with the next sync, a little after the join call returned.
  setTimeout(() => client.sync.roomsCb?.([{ tag: "Reset", inner: { values: [room] } }]), 10);
  let list: RoomSummary[] = [];
  engine.rooms.subscribe((u) => (list = applyUpdates(list, u)));
  const id = await engine.rooms.joinRoom("#r:s");
  expect(id).toBe("!joined:s");
  expect(list.map((r) => r.name)).toEqual(["Joined"]);
});
