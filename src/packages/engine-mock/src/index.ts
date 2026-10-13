import type { Listener, ListUpdate, MatrixEngine, RoomId, RoomSummary, Session, SyncState, TimelineHandle, TimelineItem } from "@ohmatrix/core";
import { EngineError } from "@ohmatrix/core";

/** In-memory engine for UI development and tests; no network. */
export class MockEngine implements MatrixEngine {
  private me = "@me:example.org";
  private seq = 0;
  private syncCbs = new Set<Listener<SyncState>>();
  private roomCbs = new Set<Listener<ListUpdate<RoomSummary>[]>>();
  private timelines = new Map<RoomId, TimelineItem[]>();
  private tlCbs = new Map<RoomId, Set<Listener<ListUpdate<TimelineItem>[]>>>();
  private roomData = new Map<RoomId, RoomSummary>();

  constructor() {
    for (const [id, name] of [
      ["!general:example.org", "General"],
      ["!dev:example.org", "Dev"],
    ] as const) {
      this.roomData.set(id, { id, name, isDirect: false, memberCount: 3, unreadCount: 0, highlightCount: 0, lastActivityTs: 0 });
      this.timelines.set(id, []);
    }
  }

  readonly auth = {
    loginWithPassword: async (homeserver: string, username: string): Promise<Session> => {
      this.me = `@${username}:${homeserver.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`;
      return { homeserver, userId: this.me, deviceId: "MOCK", accessToken: "mock" };
    },
    restore: async (session: Session) => {
      this.me = session.userId;
    },
    logout: async () => {},
  };

  readonly sync = {
    start: async () => this.setSync("syncing"),
    stop: async () => this.setSync("stopped"),
    onState: (cb: Listener<SyncState>) => {
      this.syncCbs.add(cb);
      return () => {
        this.syncCbs.delete(cb);
      };
    },
  };

  readonly profile = {
    subscribe: (cb: Listener<{ userId: string; displayName: string } | null>) => {
      cb({ userId: this.me, displayName: this.me.replace(/^@/, "").replace(/:.*$/, "") });
      return () => {};
    },
    setDisplayName: async () => {},
    setAvatar: async () => {},
    setStatus: async () => {},
  };

  readonly search = { messages: async () => ({ results: [], localRooms: 0 }) };

  readonly roomAdmin = {
    setName: async () => {},
    setTopic: async () => {},
    setAvatar: async () => {},
    invite: async () => {},
    kick: async () => {},
    setRole: async () => {},
  };

  readonly devices = {
    list: async () => [{ id: "MOCK", name: "Mock", current: true }],
    remove: async () => {},
  };

  readonly users = {
    search: async (term: string) => {
      const t = term.trim().toLowerCase();
      return ["alice", "bob"].filter((n) => t && n.includes(t)).map((n) => ({ userId: `@${n}:example.org`, displayName: n }));
    },
  };

  readonly notifications = { subscribe: (_cb: Listener<import("@ohmatrix/core").IncomingNotification>) => () => {} };

  readonly security = {
    state: async () => "unavailable" as const,
    onState: (cb: Listener<"unavailable">) => {
      cb("unavailable");
      return () => {};
    },
    setUp: async (): Promise<{ recoveryKey: string }> => {
      throw new EngineError("unsupported", "mock has no encryption");
    },
    restoreWithRecoveryKey: async (): Promise<void> => {
      throw new EngineError("unsupported", "mock has no encryption");
    },
  };

  readonly media = {
    resolve: async (): Promise<string> => {
      throw new EngineError("unsupported", "mock has no media");
    },
  };

  readonly rooms = {
    subscribe: (cb: Listener<ListUpdate<RoomSummary>[]>) => {
      this.roomCbs.add(cb);
      cb([{ op: "reset", items: this.sorted() }]);
      return () => {
        this.roomCbs.delete(cb);
      };
    },
    acceptInvite: async () => {},
    declineInvite: async () => {},
    setPinned: async () => {},
    setMarkedUnread: async () => {},
    markRead: async (roomId: string) => this.markRead(roomId),
    subscribeDetails: (roomId: string, cb: Listener<import("@ohmatrix/core").RoomDetails>) => {
      const r = this.roomData.get(roomId);
      if (r)
        cb({
          id: roomId,
          name: r.name,
          isDirect: false,
          isEncrypted: false,
          members: [],
          muted: false,
          me: this.me,
          myRole: "admin",
          can: { editInfo: false, invite: false, kick: false, changeRoles: false },
        });
      return () => {};
    },
    leave: async (roomId: string) => {
      this.roomData.delete(roomId);
      this.emitRooms();
    },
    setMuted: async () => {},
    createDirect: async (userId: string) => `!dm-${userId}`,
    createGroup: async (o: { name: string }) => `!group-${o.name}`,
    joinRoom: async (idOrAlias: string) => idOrAlias,
  };

  openTimeline(roomId: RoomId): TimelineHandle {
    if (!this.roomData.has(roomId)) throw new EngineError("not_found", `unknown room ${roomId}`);
    let set = this.tlCbs.get(roomId);
    if (!set) this.tlCbs.set(roomId, (set = new Set()));
    const mine = set;
    return {
      firstUnreadEventId: null,
      subscribe: (cb) => {
        mine.add(cb);
        cb([{ op: "reset", items: this.timelines.get(roomId) ?? [] }]);
        return () => {
          mine.delete(cb);
        };
      },
      paginateBackwards: async () => {},
      sendText: async (body) => this.send(roomId, body),
      setTyping: () => {},
      onTyping: (cb) => {
        cb([]);
        return () => {};
      },
      sendAttachment: async () => {},
      cancelUpload: () => {},
      edit: async () => {},
      redact: async () => {},
      reply: async (_id, body) => this.send(roomId, body),
      react: async () => {},
      markRead: async () => this.markRead(roomId),
      close: () => mine.clear(),
    };
  }

  private send(roomId: RoomId, body: string) {
    const room = this.roomData.get(roomId)!;
    const tl = this.timelines.get(roomId) ?? [];
    const item: TimelineItem = {
      id: `$mock${++this.seq}`,
      roomId,
      sender: this.me,
      senderName: "me",
      isOwn: true,
      ts: Date.now(),
      status: "sent",
      content: { kind: "text", body },
    };
    this.timelines.set(roomId, [...tl, item]);
    this.roomData.set(roomId, { ...room, lastMessage: item, lastActivityTs: item.ts });
    this.tlCbs.get(roomId)?.forEach((cb) => cb([{ op: "insert", index: tl.length, item }]));
    this.emitRooms();
  }

  private markRead(roomId: RoomId) {
    const room = this.roomData.get(roomId)!;
    this.roomData.set(roomId, { ...room, unreadCount: 0, highlightCount: 0 });
    this.emitRooms();
  }

  private setSync(s: SyncState) {
    this.syncCbs.forEach((cb) => cb(s));
  }
  private sorted() {
    return [...this.roomData.values()].sort((a, b) => b.lastActivityTs - a.lastActivityTs);
  }
  private emitRooms() {
    const u: ListUpdate<RoomSummary>[] = [{ op: "reset", items: this.sorted() }];
    this.roomCbs.forEach((cb) => cb(u));
  }
}
