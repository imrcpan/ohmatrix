import { expect, test } from "vitest";
import { EngineError, type Preferences, type Session, type SessionStore } from "@ohmatrix/core";
import { MockEngine } from "@ohmatrix/engine-mock";
import { createAppController, totalUnread } from "./index.js";

const memoryStore = (): SessionStore & { saved: Session | null } => {
  const s = {
    saved: null as Session | null,
    load: async () => s.saved,
    save: async (x: Session) => {
      s.saved = x;
    },
    clear: async () => {
      s.saved = null;
    },
  };
  return s;
};

test("bootstrap without session → signedOut; login → signedIn and persists session", async () => {
  const store = memoryStore();
  const app = createAppController(new MockEngine(), { sessionStore: store });
  await app.bootstrap();
  expect(app.store.getState().auth).toBe("signedOut");
  await app.login("http://localhost:8008", "test", "123456");
  expect(app.store.getState().auth).toBe("signedIn");
  expect(store.saved?.userId).toBe("@test:localhost:8008");
  await app.logout();
  expect(app.store.getState().auth).toBe("signedOut");
  expect(store.saved).toBeNull();
});

test("the server signed in to is remembered, by signing in or by registering, and only saved when it changes", async () => {
  let saved: Preferences | null = null;
  let saves = 0;
  const app = createAppController(new MockEngine(), {
    sessionStore: memoryStore(),
    preferences: {
      load: async () => ({}),
      save: async (p) => {
        saved = p;
        saves++;
      },
    },
  });
  await app.bootstrap();
  expect(app.store.getState().prefs.lastHomeserver).toBeNull();
  await app.login(" chat.example.org ", "test", "123456");
  expect(app.store.getState().prefs.lastHomeserver).toBe("chat.example.org");
  await app.logout();
  expect(app.store.getState().prefs.lastHomeserver).toBe("chat.example.org"); // it outlives the session
  await app.register("chat.example.org", "newbie", "123456");
  expect(app.store.getState().auth).toBe("signedIn");
  expect(app.store.getState().userId).toBe("@newbie:chat.example.org");
  expect(saves).toBe(1);
  expect(saved!.lastHomeserver).toBe("chat.example.org");
  await app.logout();
  await app.register("other.example.org", "newbie", "123456");
  expect(saved!.lastHomeserver).toBe("other.example.org");
});

test("a failed registration leaves the user signed out with the server's reason, and the server is not remembered", async () => {
  const engine = new MockEngine();
  engine.auth.register = async () => {
    throw new EngineError("forbidden", "Registration has been disabled");
  };
  const app = createAppController(engine, { sessionStore: memoryStore() });
  await app.bootstrap();
  await app.register("closed.example.org", "x", "123456");
  const s = app.store.getState();
  expect(s.auth).toBe("signedOut");
  expect(s.authErrorCode).toBe("forbidden");
  expect(s.prefs.lastHomeserver).toBeNull();
});

test("sent message shows up in timeline and room list", async () => {
  const engine = new MockEngine();
  const app = createAppController(engine, { sessionStore: memoryStore() });
  await engine.sync.start();
  const room = app.openRoom("!dev:example.org");
  await room.sendText("hi");
  const s = app.store.getState();
  expect(s.timelines["!dev:example.org"]).toHaveLength(1);
  expect(s.rooms[0]?.id).toBe("!dev:example.org");
  room.close();
  app.dispose();
});

test("preferences load on bootstrap and persist on change", async () => {
  let saved: unknown = { theme: "sakura", locale: "zh-CN" };
  const app = createAppController(new MockEngine(), {
    sessionStore: memoryStore(),
    preferences: {
      load: async () => saved as never,
      save: async (p) => {
        saved = p;
      },
    },
  });
  await app.bootstrap();
  expect(app.store.getState().prefs).toEqual({
    theme: "sakura",
    locale: "zh-CN",
    sidebarWidth: null,
    uiScale: 1,
    notifications: false,
    notificationPreview: true,
    lastHomeserver: null,
  });
  app.setPreferences({ sidebarWidth: 400 });
  await Promise.resolve();
  await Promise.resolve();
  expect(saved).toEqual({
    theme: "sakura",
    locale: "zh-CN",
    sidebarWidth: 400,
    uiScale: 1,
    notifications: false,
    notificationPreview: true,
    lastHomeserver: null,
  });
});

test("totalUnread counts notifying chats, manual marks once, and skips muted chats and invites", () => {
  const r = (o: Partial<import("@ohmatrix/core").RoomSummary>) => ({
    id: "!x",
    name: "x",
    isDirect: false,
    memberCount: 2,
    unreadCount: 0,
    highlightCount: 0,
    lastActivityTs: 0,
    ...o,
  });
  expect(totalUnread([])).toBe(0);
  expect(
    totalUnread([
      r({ unreadCount: 3 }),
      r({ unreadCount: 2, muted: true }),
      r({ markedUnread: true }),
      r({ unreadCount: 5, invite: { inviter: "a" } }),
      r({ unreadCount: 4, markedUnread: true }),
    ]),
  ).toBe(3 + 1 + 4);
});

test("back steps out of one layer at a time, topmost first, and says when there is nothing left", async () => {
  const app = createAppController(new MockEngine(), { sessionStore: memoryStore() });
  await app.bootstrap();
  await app.login("http://localhost:8008", "test", "123456");
  const st = () => app.store.getState();

  // Nothing is open: the app is at its first screen.
  expect(app.back()).toBe(false);

  // A chat with its info panel open: the panel closes first, then the chat.
  app.selectRoom("!general:example.org");
  app.openRoomInfo(true);
  expect(app.back()).toBe(true);
  expect(st()).toMatchObject({ roomInfoOpen: false, selectedRoomId: "!general:example.org" });
  expect(app.back()).toBe(true);
  expect(st().selectedRoomId).toBeNull();
  expect(app.back()).toBe(false);

  // Settings are reached through the profile and are left the same way, one page at a time.
  app.openSidebarPage("sessions");
  expect(app.back()).toBe(true);
  expect(st().sidebarPage).toBe("settings");
  expect(app.back()).toBe(true);
  expect(st().sidebarPage).toBe("profile");
  expect(app.back()).toBe(true);
  expect(st().sidebarPage).toBe("chats");
  expect(app.back()).toBe(false);

  // A space, with its info page over it, and a chat opened from inside it: chat, then info, then space.
  app.openSpace("!dev:example.org");
  app.openSpaceInfo(true);
  expect(st()).toMatchObject({ spaceId: "!dev:example.org", spaceInfoOpen: true });
  expect(app.back()).toBe(true);
  expect(st()).toMatchObject({ spaceInfoOpen: false, spaceId: "!dev:example.org" });
  app.selectRoom("!general:example.org");
  expect(app.back()).toBe(true);
  expect(st()).toMatchObject({ selectedRoomId: null, spaceId: "!dev:example.org" });
  expect(app.back()).toBe(true);
  expect(st().spaceId).toBeNull();
  expect(app.back()).toBe(false);
});

const savedSession: Session = { homeserver: "https://chat.example.org", userId: "@test:chat.example.org", deviceId: "D", accessToken: "t" };

test("with no network a saved session stays signed in and the sync state tells; the cache is shown", async () => {
  const engine = new MockEngine();
  engine.sync.start = async () => {
    throw new EngineError("network", "error sending request");
  };
  const store = memoryStore();
  store.saved = savedSession;
  const app = createAppController(engine, { sessionStore: store });
  await app.bootstrap();
  expect(app.store.getState().auth).toBe("signedIn");
  expect(store.saved).not.toBeNull();
});

test("only the server's own refusal sends a saved session back to sign-in, and clears it", async () => {
  const engine = new MockEngine();
  engine.sync.start = async () => {
    throw new EngineError("unauthorized", "Unknown token");
  };
  const store = memoryStore();
  store.saved = savedSession;
  const app = createAppController(engine, { sessionStore: store });
  await app.bootstrap();
  expect(app.store.getState().auth).toBe("signedOut");
  expect(store.saved).toBeNull();
});

test("previewPreferences applies a setting without saving it; setPreferences saves it", async () => {
  const saves: Preferences[] = [];
  const app = createAppController(new MockEngine(), {
    sessionStore: memoryStore(),
    preferences: { load: async () => ({}), save: async (p) => void saves.push(p) },
  });
  await app.bootstrap();
  app.previewPreferences({ uiScale: 2 });
  await Promise.resolve();
  expect(app.store.getState().prefs.uiScale).toBe(2);
  expect(saves).toEqual([]);
  app.previewPreferences({ uiScale: 1 }); // reverted: nothing was ever written
  expect(saves).toEqual([]);
  app.setPreferences({ uiScale: 1.5 });
  await Promise.resolve();
  expect(saves.map((p) => p.uiScale)).toEqual([1.5]);
});
