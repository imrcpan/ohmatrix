// Renders the window's and the package's icons from the project's logo, at build time: the repository keeps only the SVG.
//
//   node scripts/makeIcons.mjs [outDir]      (default: src-tauri/icons/, which git ignores)
//
// Makes what a Linux package needs: icon.png (512), 32x32.png, 128x128.png and 128x128@2x.png, and what Windows needs (the window's file
// and the installer's): icon.ico, and what macOS needs: icon.icns, from logo/colorful/1.svg (the icon with its own rounded shape). That drawing is not square (1025 x 1045),
// and a package wants a square icon: it is set in the middle of a transparent square.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const here = dirname(fileURLToPath(import.meta.url));
const LOGO_SVG = resolve(here, "../../../../logo/colorful/1.svg");
const SIZES = { "icon.png": 512, "32x32.png": 32, "128x128.png": 128, "128x128@2x.png": 256 };
// The sizes inside icon.ico: what Windows picks from for the title bar, the taskbar, the explorer and the installer.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

const out = resolve(process.argv[2] ?? join(here, "../src-tauri/icons"));
mkdirSync(out, { recursive: true });
const svg = readFileSync(LOGO_SVG);
const { width, height } = new Resvg(svg);

/** The logo as a square PNG of `size` pixels. */
function square(size) {
  // Drawn at `size` along its longer side, in a square of `size`: the shorter side is centred.
  const drawn = new Resvg(svg, { fitTo: { mode: height > width ? "height" : "width", value: size } }).render();
  return new Resvg(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><image href="data:image/png;base64,${drawn.asPng().toString("base64")}" x="${(size - drawn.width) / 2}" y="${(size - drawn.height) / 2}" width="${drawn.width}" height="${drawn.height}"/></svg>`,
  )
    .render()
    .asPng();
}

/** An .ico file holding these PNGs (Windows reads PNG inside an icon file); a size of 256 is written as 0, as the format has it. */
function ico(images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2); // type: icon
  head.writeUInt16LE(images.length, 4);
  let offset = head.length;
  images.forEach(({ size, png }, i) => {
    const at = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, at);
    head.writeUInt8(size >= 256 ? 0 : size, at + 1);
    head.writeUInt16LE(1, at + 4); // colour planes
    head.writeUInt16LE(32, at + 6); // bits per pixel
    head.writeUInt32LE(png.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([head, ...images.map(({ png }) => png)]);
}

/** An .icns file holding PNGs of these sizes (macOS reads PNG inside an icon file); each is a chunk named for its size. */
const ICNS_TYPES = { 128: "ic07", 256: "ic08", 512: "ic09", 1024: "ic10" };
function icns() {
  const chunks = Object.entries(ICNS_TYPES).map(([size, type]) => {
    const png = square(Number(size));
    const head = Buffer.alloc(8);
    head.write(type, 0, "ascii");
    head.writeUInt32BE(8 + png.length, 4);
    return Buffer.concat([head, png]);
  });
  const total = 8 + chunks.reduce((n, c) => n + c.length, 0);
  const head = Buffer.alloc(8);
  head.write("icns", 0, "ascii");
  head.writeUInt32BE(total, 4);
  return Buffer.concat([head, ...chunks]);
}

for (const [name, size] of Object.entries(SIZES)) writeFileSync(join(out, name), square(size));
writeFileSync(join(out, "icon.ico"), ico(ICO_SIZES.map((size) => ({ size, png: square(size) }))));
writeFileSync(join(out, "icon.icns"), icns());
console.log(`icons: ${Object.keys(SIZES).join(", ")}, icon.ico, icon.icns -> ${out}`);
