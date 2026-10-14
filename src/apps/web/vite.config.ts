import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Our sources import siblings as "./Name.js" (TypeScript style), which skips the "prefer *.web.tsx" extension search.
 * If `Name.web.tsx` / `Name.web.ts` exists next to the importer, use it: that is how a component gets a web-only
 * implementation (the plain file is the native fallback).
 */
function webPlatformFiles() {
  // Testing only: OHMATRIX_NATIVE_LIST=1 builds the web app with the native message list (the inverted one phones use)
  // in place of the web one, so the same end-to-end tests can exercise it in a browser.
  const nativeList = process.env.OHMATRIX_NATIVE_LIST === "1";
  return {
    name: "ohmatrix-web-platform-files",
    enforce: "pre" as const,
    resolveId(source: string, importer?: string) {
      if (!importer || !source.startsWith(".") || !source.endsWith(".js")) return null;
      if (nativeList && /\/MessageList\.js$/.test(source)) return null;
      for (const ext of [".web.tsx", ".web.ts"]) {
        const candidate = resolve(dirname(importer), source.replace(/\.js$/, ext));
        if (existsSync(candidate)) return candidate;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [webPlatformFiles(), react()],
  resolve: {
    alias: [{ find: /^react-native$/, replacement: "react-native-web" }],
    // Prefer *.web.* platform files (react-native-svg, our own platform splits).
    extensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".js", ".mjs", ".json"],
  },
  optimizeDeps: {
    rolldownOptions: {
      resolve: {
        alias: { "react-native": "react-native-web" },
        extensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".js", ".mjs", ".json"],
      },
    },
  },
  define: { global: "globalThis" },
});
