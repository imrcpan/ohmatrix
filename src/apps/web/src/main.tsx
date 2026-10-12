import { createRoot } from "react-dom/client";
import type { AttachmentSource, PlatformServices, Preferences, Session, SessionStore } from "@ohmatrix/core";
import { JsSdkEngine } from "@ohmatrix/engine-js";
import { createAppController } from "@ohmatrix/state";
import { App } from "@ohmatrix/app";

const KEY = "ohmatrix.session.v1";
// TODO: encrypt at rest (WebCrypto non-extractable key in IndexedDB) before shipping.
const sessionStore: SessionStore = {
  load: async () => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? "null") as Session | null;
    } catch {
      return null;
    }
  },
  save: async (s) => localStorage.setItem(KEY, JSON.stringify(s)),
  clear: async () => localStorage.removeItem(KEY),
};

const PREFS_KEY = "ohmatrix.prefs.v1";
const preferences = {
  load: async (): Promise<Partial<Preferences>> => {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Preferences>;
    } catch {
      return {};
    }
  },
  save: async (p: Preferences) => localStorage.setItem(PREFS_KEY, JSON.stringify(p)),
};

const services: PlatformServices = {
  sessionStore,
  preferences,
  pickFiles: () =>
    new Promise<AttachmentSource[]>((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.onchange = () =>
        resolve([...(input.files ?? [])].map((f) => ({ name: f.name, mimeType: f.type || "application/octet-stream", size: f.size, data: f })));
      input.oncancel = () => resolve([]);
      input.click();
    }),
  saveFile: async ({ url, name }) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
  },
};
const controller = createAppController(new JsSdkEngine(), services);

// Mirror navigation to the URL hash so browser back/forward works (essential in portrait layout):
//   #/<page>[/room/<id>[/info]]   where page is chats | profile | settings
type Page = "chats" | "profile" | "settings";
interface Route {
  page: Page;
  room: string | null;
  info: boolean;
}
const parseHash = (): Route => {
  const m = location.hash.match(/^#\/(chats|profile|settings)?(?:\/?room\/([^/]+)(\/info)?)?$/);
  return { page: (m?.[1] as Page | undefined) ?? "chats", room: m?.[2] ? decodeURIComponent(m[2]) : null, info: !!m?.[3] };
};
const hashFor = ({ page, room, info }: Route) => `#/${page}${room ? `/room/${encodeURIComponent(room)}${info ? "/info" : ""}` : ""}`;
const applyRoute = ({ page, room, info }: Route) => {
  controller.openSidebarPage(page);
  controller.selectRoom(room);
  controller.openRoomInfo(info);
};
controller.store.subscribe((s, prev) => {
  if (s.selectedRoomId === prev.selectedRoomId && s.sidebarPage === prev.sidebarPage && s.roomInfoOpen === prev.roomInfoOpen) return;
  const want = hashFor({ page: s.sidebarPage, room: s.selectedRoomId, info: s.roomInfoOpen });
  if (location.hash !== want) history.pushState(null, "", want);
});
addEventListener("popstate", () => applyRoute(parseHash()));
void controller.bootstrap().then(() => {
  if (controller.store.getState().auth === "signedIn") applyRoute(parseHash());
});

createRoot(document.getElementById("root")!).render(
  <App controller={controller} services={services} defaultHomeserver={import.meta.env.VITE_DEFAULT_HOMESERVER ?? "http://localhost:8008"} />,
);
