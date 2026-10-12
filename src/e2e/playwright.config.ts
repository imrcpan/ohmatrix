import { defineConfig } from "@playwright/test";

// Requires the dev Synapse: `src/dev/synapse/up.sh && node src/dev/synapse/seed.mjs`.
export default defineConfig({
  testDir: "tests",
  outputDir: ".out",
  workers: 1,
  use: { baseURL: "http://localhost:5173", screenshot: "off" },
  webServer: { command: "pnpm --filter @ohmatrix/web dev --port 5173 --strictPort", url: "http://localhost:5173", reuseExistingServer: true, cwd: ".." },
});
