import { createRoot } from "react-dom/client";
import type { AttachmentSource, PlatformServices, Preferences } from "@ohmatrix/core";
import { JsSdkEngine } from "@ohmatrix/engine-js";
import { createAppController } from "@ohmatrix/state";
import { App } from "@ohmatrix/app";
import { createCryptoKeyProvider } from "./cryptoKeys.js";
import { createSecureBox } from "./secureBox.js";
import { createSecureSessionStore } from "./secureSession.js";
import { installRouter } from "./router.js";

// The session (access token) is encrypted with a non-extractable WebCrypto key before it is stored.
const secureBox = createSecureBox();
const sessionStore = createSecureSessionStore(secureBox);

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
const controller = createAppController(new JsSdkEngine({ storageKey: createCryptoKeyProvider(secureBox) }), services);

installRouter(controller);
void controller.bootstrap();

createRoot(document.getElementById("root")!).render(
  <App controller={controller} services={services} defaultHomeserver={import.meta.env.VITE_DEFAULT_HOMESERVER ?? "http://localhost:8008"} />,
);
