// Renders the window's and the package's icons from the project's logo, at build time: the repository keeps only the SVG.
//
//   node scripts/makeIcons.mjs [outDir]      (default: src-tauri/icons/, which git ignores)
//
// Makes what a Linux package needs: icon.png (512), 32x32.png, 128x128.png and 128x128@2x.png, from logo/colorful/1.svg (the icon with its own
// rounded shape). That drawing is not square (1025 x 1045), and a package wants a square icon: it is set in the middle of a transparent square.

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
const { width, height } = new Resvg(svg);
for (const [name, size] of Object.entries(SIZES)) {
  // Drawn at `size` along its longer side, in a square of `size`: the shorter side is centred.
  const drawn = new Resvg(svg, { fitTo: { mode: height > width ? "height" : "width", value: size } }).render();
  const square = new Resvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><image href="data:image/png;base64,${drawn.asPng().toString("base64")}" x="${(size - drawn.width) / 2}" y="${(size - drawn.height) / 2}" width="${drawn.width}" height="${drawn.height}"/></svg>`,
  ).render();
  writeFileSync(join(out, name), square.asPng());
}
console.log(`icons: ${Object.keys(SIZES).join(", ")} -> ${out}`);
