import { createRoot } from "react-dom/client";
import { installLog, type AppServices, type AttachmentSource, type Preferences } from "@ohmatrix/core";
import { JsSdkEngine } from "@ohmatrix/engine-js";
import { createAccountManager } from "@ohmatrix/state";
import { App } from "@ohmatrix/app";
import logoSvg from "../../../../logo/colorful/1.svg?raw";
import { createCryptoKeyProvider } from "./cryptoKeys.js";
import { createSecureBox } from "./secureBox.js";
import { createSecureAccountStore, createSecureSessionStore } from "./secureSession.js";
import { createWebNotifications } from "./notifications.js";
import { createWebCallSounds } from "./callSounds.js";
import { receiveFiles } from "./receiveFiles.js";
import { openRecorder } from "./recorder.js";
import { installRouter } from "./router.js";

/**
 * Starts the app in the page: the browser's own services, and any of them replaced by `overrides` (another platform that shows this same
 * page in its own window, with what the browser does not do there).
 */
export async function startWeb(overrides: Partial<AppServices> = {}): Promise<void> {
  // The session (access token) is encrypted with a non-extractable WebCrypto key before it is stored.
  const secureBox = createSecureBox();
  const accounts = createSecureAccountStore(secureBox);
  const legacySessions = createSecureSessionStore(secureBox); // the one session saved before there were several accounts

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

  // The log the app shows in Settings > Advanced options starts here.
  installLog();

  const services: AppServices = {
    // The sign-in screen draws the page's own icon, logo/colorful/1.svg (the same file as the favicon).
    appLogo: () => logoSvg,
    // Set by the build (scripts/build-web.sh --version a.b.c); a development server has none.
    ...(import.meta.env.VITE_APP_VERSION ? { appVersion: import.meta.env.VITE_APP_VERSION as string } : {}),
    preferences,
    notifications: createWebNotifications(),
    callSounds: createWebCallSounds(),
    recordMedia: openRecorder,
    // The input bar offers voice messages only; a video is sent as a file.
    recordKinds: ["audio"],
    openLink: (url) => void window.open(url, "_blank", "noopener,noreferrer"),
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
      // A name with no extension (an avatar has none): the file's own type says what to add.
      let filename = name;
      if (!/\.[A-Za-z0-9]{2,5}$/.test(name)) {
        const type = await fetch(url).then(
          async (r) => (await r.blob()).type,
          () => "",
        );
        const ext = ({ "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" } as Record<string, string>)[type];
        if (ext) filename = `${name}.${ext}`;
      }
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
    },
    ...overrides,
  };
  /** Prefilled on the sign-in screen. Override at build time with VITE_DEFAULT_HOMESERVER (e.g. a local test server). */
  const DEFAULT_HOMESERVER = "matrix.org";

  // One engine per account: the browser databases it uses are named after the account and device, so they never meet.
  const manager = createAccountManager({
    accounts,
    legacySessions,
    services,
    makeEngine: () => new JsSdkEngine({ storageKey: createCryptoKeyProvider(secureBox) }),
  });

  // Development only: lets tests and the console poke the running app (`controller` is always the one on screen).
  if (import.meta.env.DEV)
    (window as unknown as { __ohmatrix: unknown }).__ohmatrix = {
      manager,
      get controller() {
        return manager.current();
      },
    };
  if (import.meta.env.DEV)
    (window as unknown as { __ohmatrix_root: string }).__ohmatrix_root = new URL("../../../../", import.meta.url).pathname.replace(
      /\/$/,
      "",
    ); /* e.g. /@fs/home/.../repo in dev */

  await manager.start();
  installRouter(manager);

  createRoot(document.getElementById("root")!).render(
    <App
      manager={manager}
      services={services}
      onReload={() => location.reload()}
      defaultHomeserver={import.meta.env.VITE_DEFAULT_HOMESERVER ?? DEFAULT_HOMESERVER}
    />,
  );
}
