import { defineConfig } from "@playwright/test";

// Requires the dev Synapse: `src/dev/synapse/up.sh && node src/dev/synapse/seed.mjs`.
export default defineConfig({
  testDir: "tests",
  outputDir: ".out",
  workers: 1,
  use: {
    baseURL: process.env.OHMATRIX_NATIVE_LIST === "1" ? "http://localhost:5175" : "http://localhost:5174",
    screenshot: "only-on-failure",
    permissions: ["microphone", "camera", "clipboard-read", "clipboard-write"],
    // A synthetic microphone and camera, and playback without a prior click, so recording and playing can be tested.
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] },
  },
  // The tests run their own copy of the web app on its own port, pointed at the local Synapse by default, so they
  // do not depend on (or disturb) a preview server, and the app's real default (matrix.org) stays what users see.
  // With OHMATRIX_NATIVE_LIST=1 the app is built with the native (inverted) message list, on its own port, and the
  // tests that concern the message list run against it: `pnpm test:e2e:native`.
  webServer: {
    command:
      process.env.OHMATRIX_NATIVE_LIST === "1"
        ? "pnpm --filter @ohmatrix/web dev --port 5175 --strictPort"
        : "pnpm --filter @ohmatrix/web dev --port 5174 --strictPort",
    url: process.env.OHMATRIX_NATIVE_LIST === "1" ? "http://localhost:5175" : "http://localhost:5174",
    reuseExistingServer: process.env.OHMATRIX_NATIVE_LIST !== "1",
    cwd: "..",
    env: { VITE_DEFAULT_HOMESERVER: "http://localhost:8008", OHMATRIX_NATIVE_LIST: process.env.OHMATRIX_NATIVE_LIST ?? "" },
  },
});
