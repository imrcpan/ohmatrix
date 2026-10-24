import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  server: { port: 5180, strictPort: true },
  plugins: [react()],
  resolve: {
    alias: [{ find: /^react-native$/, replacement: "react-native-web" }],
    extensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".js", ".mjs", ".json"],
  },
  optimizeDeps: {
    rolldownOptions: { resolve: { alias: { "react-native": "react-native-web" } } },
  },
  define: { global: "globalThis" },
});
