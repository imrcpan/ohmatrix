import { totalUnread, type AccountManager, type AppController } from "@ohmatrix/state";

/**
 * URL scheme (history API, no hash):
 *   /                      chat list
 *   /chat/<roomId>         a chat           /chat/<roomId>/info   its info panel
 *   /profile, /settings, /sessions, /accounts, /theme   left-pane pages  (with a chat open: /chat/<roomId>?panel=profile|settings|sessions)
 * Room ids keep their `!` and `:` readable.
 */
export type Page = "chats" | "profile" | "settings" | "sessions" | "accounts" | "theme";
export interface Route {
  page: Page;
  room: string | null;
  info: boolean;
}

const enc = (s: string) => encodeURIComponent(s).replace(/%21/g, "!").replace(/%3A/gi, ":");
const isPage = (s: string | null | undefined): s is "profile" | "settings" | "sessions" | "accounts" | "theme" =>
  s === "profile" || s === "settings" || s === "sessions" || s === "accounts" || s === "theme";

export function parseLocation(pathname: string, search = "", hash = ""): Route {
  // Links from the first version used the hash: #/<page>/room/<id>[/info].
  const legacy = hash.match(/^#\/(chats|profile|settings|sessions)?(?:\/?room\/([^/]+)(\/info)?)?$/);
  if (legacy && (legacy[1] || legacy[2])) {
    return { page: (legacy[1] as Page | undefined) ?? "chats", room: legacy[2] ? decodeURIComponent(legacy[2]) : null, info: !!legacy[3] };
  }
  const seg = pathname
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
  const panel = new URLSearchParams(search).get("panel");
  if (seg[0] === "chat" && seg[1]) return { page: isPage(panel) ? panel : "chats", room: seg[1], info: seg[2] === "info" };
  if (isPage(seg[0])) return { page: seg[0], room: null, info: false };
  return { page: "chats", room: null, info: false };
}

export function buildPath({ page, room, info }: Route): string {
  if (room) return `/chat/${enc(room)}${info ? "/info" : ""}${page !== "chats" ? `?panel=${page}` : ""}`;
  return page === "chats" ? "/" : `/${page}`;
}

/** Keeps the address bar and the app navigation state in sync, in both directions. */
export function installRouter(manager: AccountManager): void {
  // Only on http(s): under file:// (the desktop shell) paths are file names and cannot be rewritten.
  const rewritable = /^https?:$/.test(location.protocol);
  const current = () => parseLocation(location.pathname, location.search, location.hash);
  const here = () => location.pathname + location.search;

  // Old hash links become clean paths without adding a history entry.
  if (rewritable && location.hash.startsWith("#/")) history.replaceState(null, "", buildPath(current()));

  /** Follow one controller: its screen is written to the address, and the address is applied to it when it signs in. */
  const follow = (controller: AppController): (() => void) => {
    const stopTitle = installTitle(controller);
    if (!rewritable) return stopTitle;
    const apply = (r: Route) => {
      controller.openSidebarPage(r.page);
      controller.selectRoom(r.room);
      controller.openRoomInfo(r.info);
    };
    const stop = controller.store.subscribe((s, prev) => {
      if (s.auth === "signedIn" && prev.auth !== "signedIn") {
        apply(current());
        return;
      } // deep link, or first sign-in
      if (prev.auth === "signedIn" && s.auth !== "signedIn") {
        history.replaceState(null, "", "/");
        return;
      } // signed out: forget where we were
      if (s.selectedRoomId === prev.selectedRoomId && s.sidebarPage === prev.sidebarPage && s.roomInfoOpen === prev.roomInfoOpen) return;
      if (s.auth !== "signedIn") return; // never rewrite the URL while signed out: it may be a deep link waiting for login
      const want = buildPath({ page: s.sidebarPage, room: s.selectedRoomId, info: s.roomInfoOpen });
      if (here() !== want) history.pushState(null, "", want);
    });
    return () => {
      stop();
      stopTitle();
    };
  };

  let bound = manager.current();
  let unfollow = follow(bound);
  let key = manager.store.getState().currentKey;
  manager.store.subscribe((s) => {
    if (s.currentKey === key) return;
    key = s.currentKey;
    const next = manager.current();
    if (next === bound) return; // a sign-in that has just become an account: same controller, same screen
    unfollow();
    bound = next;
    // Another account: its screen starts at the chat list, and the address says so.
    if (rewritable) history.replaceState(null, "", "/");
    unfollow = follow(next);
  });

  if (rewritable)
    addEventListener("popstate", () => {
      const c = manager.current();
      if (c.store.getState().auth !== "signedIn") return;
      const r = current();
      c.openSidebarPage(r.page);
      c.selectRoom(r.room);
      c.openRoomInfo(r.info);
    });
}

/** Title: unread total and the open chat's name, e.g. "(3) Alice · OhMatrix". Works under every protocol. */
export function installTitle(controller: AppController): () => void {
  const update = () => {
    const s = controller.store.getState();
    const name = s.selectedRoomId ? s.rooms.find((r) => r.id === s.selectedRoomId)?.name : undefined;
    const unread = s.auth === "signedIn" ? totalUnread(s.rooms) : 0;
    const title = `${unread > 0 ? `(${unread > 99 ? "99+" : unread}) ` : ""}${name ? `${name} · ` : ""}OhMatrix`;
    if (document.title !== title) document.title = title;
  };
  const stop = controller.store.subscribe(update);
  update();
  return stop;
}
