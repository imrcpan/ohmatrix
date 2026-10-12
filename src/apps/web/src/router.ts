import { totalUnread, type AppController } from "@ohmatrix/state";

/**
 * URL scheme (history API, no hash):
 *   /                      chat list
 *   /chat/<roomId>         a chat           /chat/<roomId>/info   its info panel
 *   /profile, /settings, /sessions   left-pane pages  (with a chat open: /chat/<roomId>?panel=profile|settings|sessions)
 * Room ids keep their `!` and `:` readable.
 */
export type Page = "chats" | "profile" | "settings" | "sessions";
export interface Route {
  page: Page;
  room: string | null;
  info: boolean;
}

const enc = (s: string) => encodeURIComponent(s).replace(/%21/g, "!").replace(/%3A/gi, ":");
const isPage = (s: string | null | undefined): s is "profile" | "settings" | "sessions" => s === "profile" || s === "settings" || s === "sessions";

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
export function installRouter(controller: AppController): void {
  installTitle(controller);
  // Only on http(s): under file:// (the desktop shell) paths are file names and cannot be rewritten.
  if (!/^https?:$/.test(location.protocol)) return;
  const current = () => parseLocation(location.pathname, location.search, location.hash);
  const apply = (r: Route) => {
    controller.openSidebarPage(r.page);
    controller.selectRoom(r.room);
    controller.openRoomInfo(r.info);
  };
  const here = () => location.pathname + location.search;

  // Old hash links become clean paths without adding a history entry.
  if (location.hash.startsWith("#/")) {
    const r = current();
    history.replaceState(null, "", buildPath(r));
  }

  controller.store.subscribe((s, prev) => {
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

  addEventListener("popstate", () => {
    if (controller.store.getState().auth === "signedIn") apply(current());
  });
}

/** Title: unread total and the open chat's name, e.g. "(3) Alice · OhMatrix". Works under every protocol. */
export function installTitle(controller: AppController): void {
  const update = () => {
    const s = controller.store.getState();
    const name = s.selectedRoomId ? s.rooms.find((r) => r.id === s.selectedRoomId)?.name : undefined;
    const unread = s.auth === "signedIn" ? totalUnread(s.rooms) : 0;
    const title = `${unread > 0 ? `(${unread > 99 ? "99+" : unread}) ` : ""}${name ? `${name} · ` : ""}OhMatrix`;
    if (document.title !== title) document.title = title;
  };
  controller.store.subscribe(update);
  update();
}
