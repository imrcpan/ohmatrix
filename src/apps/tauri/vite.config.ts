import { mergeConfig } from "vite";
import web from "@ohmatrix/web/vite.config";

// The web app's build (its platform files, aliases and icon), with this folder as the root, the port the window's dev address names, and
// the folder the package takes the window's page from.
export default mergeConfig(web, {
  root: import.meta.dirname,
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
});
