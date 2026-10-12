import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
