// Renders the app icon from the project's logo, at build time: the repository keeps only the SVG, never an image made from it.
//
//   node scripts/makeIcons.mjs [outDir]      (default: .generated/ in this folder, which git ignores)
//
// icon.png is logo/main-full.svg (the logo on a full square of its own colour), 1024 x 1024: what Expo's `icon` takes, and what it cuts
// the launcher shapes out of.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const here = dirname(fileURLToPath(import.meta.url));
export const LOGO_SVG = resolve(here, "../../../../logo/main-full.svg");
export const ICON_SIZE = 1024;

/**
 * The logo's canvas is 1025 x 1045, a hair taller than wide, and an icon is square. The logo is not stretched: it is placed in the middle
 * of a square, and the strip beside it is filled with the logo's own background colour (the first `fill` of the file), so the launcher's
 * shape is cut from one even colour.
 */
export function squareSvg(svg, size) {
  const view = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1]?.trim().split(/\s+/).map(Number);
  const [x, y, w, h] = view ?? [0, 0, 1024, 1024];
  const side = Math.max(w, h);
  const bg = /<rect[^>]*fill="(#[0-9A-Fa-f]{3,8})"/.exec(svg)?.[1] ?? /fill="(#[0-9A-Fa-f]{3,8})"/.exec(svg)?.[1] ?? "#000000";
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const cx = x - (side - w) / 2;
  const cy = y - (side - h) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cx} ${cy} ${side} ${side}" width="${size}" height="${size}"><rect x="${cx}" y="${cy}" width="${side}" height="${side}" fill="${bg}"/>${inner}</svg>`;
}

/** The PNG of the logo, `size` px square. */
export function renderSquare(svg, size) {
  const png = new Resvg(squareSvg(svg, size), { fitTo: { mode: "width", value: size } }).render();
  return { png: png.asPng(), width: png.width, height: png.height };
}

export function makeIcons(outDir) {
  mkdirSync(outDir, { recursive: true });
  const svg = readFileSync(LOGO_SVG, "utf8");
  const out = join(outDir, "icon.png");
  const r = renderSquare(svg, ICON_SIZE);
  writeFileSync(out, r.png);
  return { file: out, width: r.width, height: r.height };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = makeIcons(resolve(process.argv[2] ?? join(here, "../.generated")));
  console.log(`${r.file} (${r.width} x ${r.height})`);
}
