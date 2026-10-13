import { defineConfig } from "@playwright/test";

// Requires the dev Synapse: `src/dev/synapse/up.sh && node src/dev/synapse/seed.mjs`.
export default defineConfig({
  testDir: "tests",
  outputDir: ".out",
  workers: 1,
  use: {
    baseURL: "http://localhost:5174",
    screenshot: "only-on-failure",
    permissions: ["microphone", "camera"],
    // A synthetic microphone and camera, and playback without a prior click, so recording and playing can be tested.
    launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] },
  },
  // The tests run their own copy of the web app on its own port, pointed at the local Synapse by default, so they
  // do not depend on (or disturb) a preview server, and the app's real default (matrix.org) stays what users see.
  webServer: {
    command: "pnpm --filter @ohmatrix/web dev --port 5174 --strictPort",
    url: "http://localhost:5174",
    reuseExistingServer: true,
    cwd: "..",
    env: { VITE_DEFAULT_HOMESERVER: "http://localhost:8008" },
  },
});
