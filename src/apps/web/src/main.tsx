import { createRoot } from "react-dom/client";
import type { AttachmentSource, PlatformServices, Preferences } from "@ohmatrix/core";
import { JsSdkEngine } from "@ohmatrix/engine-js";
import { createAppController } from "@ohmatrix/state";
import { App } from "@ohmatrix/app";
import { createCryptoKeyProvider } from "./cryptoKeys.js";
import { createSecureBox } from "./secureBox.js";
import { createSecureSessionStore } from "./secureSession.js";
import { createWebNotifications } from "./notifications.js";
import { receiveFiles } from "./receiveFiles.js";
import { openRecorder } from "./recorder.js";
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
  notifications: createWebNotifications(),
  recordMedia: openRecorder,
  receiveFiles,
  copyText: (text) => navigator.clipboard.writeText(text),
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
/** Prefilled on the sign-in screen. Override at build time with VITE_DEFAULT_HOMESERVER (e.g. a local test server). */
const DEFAULT_HOMESERVER = "matrix.org";

const controller = createAppController(new JsSdkEngine({ storageKey: createCryptoKeyProvider(secureBox) }), services);

// Development only: lets tests and the console poke the running app.
if (import.meta.env.DEV) (window as unknown as { __ohmatrix: unknown; __ohmatrix_root: string }).__ohmatrix = { controller };
if (import.meta.env.DEV)
  (window as unknown as { __ohmatrix_root: string }).__ohmatrix_root = new URL("../../../../", import.meta.url).pathname.replace(
    /\/$/,
    "",
  ); /* e.g. /@fs/home/.../repo in dev */

installRouter(controller);
void controller.bootstrap();

createRoot(document.getElementById("root")!).render(
  <App
    controller={controller}
    services={services}
    onReload={() => location.reload()}
    defaultHomeserver={import.meta.env.VITE_DEFAULT_HOMESERVER ?? DEFAULT_HOMESERVER}
  />,
);
