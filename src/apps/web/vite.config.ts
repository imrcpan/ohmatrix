import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
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

/**
 * The page's icon is the project's logo, logo/colorful/1.svg, served at /favicon.svg and written into the build: the repository keeps the SVG
 * once, in logo/, and nothing made from it. (Every current browser takes an SVG as a favicon; there is no .ico or .png to make.)
 */
function faviconFromLogo(): Plugin {
  const logo = resolve(__dirname, "../../../logo/colorful/1.svg");
  return {
    name: "ohmatrix-favicon",
    configureServer(server) {
      server.middlewares.use("/favicon.svg", (_req, res) => {
        res.setHeader("content-type", "image/svg+xml");
        res.end(readFileSync(logo));
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "favicon.svg", source: readFileSync(logo) });
    },
  };
}

export default defineConfig({
  plugins: [faviconFromLogo(), webPlatformFiles(), react()],
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
