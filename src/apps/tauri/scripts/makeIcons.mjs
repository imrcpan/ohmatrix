// Renders the window's and the package's icons from the project's logo, at build time: the repository keeps only the SVG.
//
//   node scripts/makeIcons.mjs [outDir]      (default: src-tauri/icons/, which git ignores)
//
// Makes what a Linux package needs: icon.png (512), 32x32.png, 128x128.png and 128x128@2x.png, from logo/colorful/1.svg (the icon with its own rounded shape).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const here = dirname(fileURLToPath(import.meta.url));
const LOGO_SVG = resolve(here, "../../../../logo/colorful/1.svg");
const SIZES = { "icon.png": 512, "32x32.png": 32, "128x128.png": 128, "128x128@2x.png": 256 };

const out = resolve(process.argv[2] ?? join(here, "../src-tauri/icons"));
mkdirSync(out, { recursive: true });
const svg = readFileSync(LOGO_SVG);
for (const [name, size] of Object.entries(SIZES)) {
  writeFileSync(join(out, name), new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng());
}
console.log(`icons: ${Object.keys(SIZES).join(", ")} -> ${out}`);
