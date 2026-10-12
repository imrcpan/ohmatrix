import { createRoot } from "react-dom/client";
import type { AttachmentSource, PlatformServices, Preferences, Session, SessionStore } from "@ohmatrix/core";
import { JsSdkEngine } from "@ohmatrix/engine-js";
import { createAppController } from "@ohmatrix/state";
import { App } from "@ohmatrix/app";
import { installRouter } from "./router.js";

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

installRouter(controller);
void controller.bootstrap();

createRoot(document.getElementById("root")!).render(
  <App controller={controller} services={services} defaultHomeserver={import.meta.env.VITE_DEFAULT_HOMESERVER ?? "http://localhost:8008"} />,
);
