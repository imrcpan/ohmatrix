// Renders the app's icons from the project's logo, at build time: the repository keeps only the SVGs, never an image made from them.
//
//   node scripts/makeIcons.mjs [outDir]      (default: .generated/ in this folder, which git ignores)
//
// What it makes:
//   icon.png                      logo/colorful-full/1.svg, 1024 x 1024: Expo's `icon`, the launcher icon the app has by default.
//   appIcons/launcher/<density>/  the icons the user can choose in Settings, for the launcher: logo/colorful-full/<id>.svg at each density
//                                 (the full square: the launcher cuts its own shape out of it).
//   appIcons/preview/<id>.png     the same choices as Settings shows them: logo/colorful/<id>.svg (the rounded shape).
//   appIcons.json, appIcons.ts    the list: the ids, the name of the launcher entry and of the picture for each, and the previews.
//
// The choices are the files in logo/colorful/, sorted by name; the first one is the default. A file there without a twin in logo/colorful-full/
// is an error, said by name.

import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const here = dirname(fileURLToPath(import.meta.url));
const LOGO = resolve(here, "../../../../logo");
export const LOGO_SVG = join(LOGO, "colorful-full", "1.svg");
export const ICON_SIZE = 1024;
export const PREVIEW_SIZE = 192;
/** Android's launcher icon sizes (dp 48) at each density. */
export const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

/**
 * Names for an id, the ones Android allows (lower case letters, digits and _ for a picture; a class-like name for the launcher entry).
 * The Android side reads the pairs from the manifest (see plugins/withAppIcons.js), so the rule is written once, here.
 */
export function namesOf(id) {
  const words = id.split(/[^a-z0-9]+/i).filter(Boolean);
  return {
    resource: `ic_launcher_${words.map((w) => w.toLowerCase()).join("_")}`,
    alias: `MainActivity${words.map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join("")}`,
  };
}

/** The choices after the default one: the names (no extension) of the files in logo/colorful/, in order. */
export function listColorful(dir = LOGO) {
  const names = readdirSync(join(dir, "colorful"))
    .filter((f) => f.endsWith(".svg"))
    .map((f) => f.slice(0, -4))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  const missing = names.filter((n) => !existsSync(join(dir, "colorful-full", `${n}.svg`)));
  if (missing.length) throw new Error(`logo/colorful/ has ${missing.map((n) => `${n}.svg`).join(", ")} but logo/colorful-full/ has no file of that name`);
  return names;
}

/**
 * The logo's canvas is 1025 x 1045, a hair taller than wide, and an icon is square. The logo is not stretched: it is placed in the middle
 * of a square. With `fill` the strip beside it is filled with the logo's own background colour (the first `fill` of the file), so the
 * launcher's shape is cut from one even colour; without it the strip stays clear (a preview of a rounded shape).
 */
export function squareSvg(svg, size, fill = true) {
  const view = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1]?.trim().split(/\s+/).map(Number);
  const [x, y, w, h] = view ?? [0, 0, 1024, 1024];
  const side = Math.max(w, h);
  const bg = /<rect[^>]*fill="(#[0-9A-Fa-f]{3,8})"/.exec(svg)?.[1] ?? /fill="(#[0-9A-Fa-f]{3,8})"/.exec(svg)?.[1] ?? "#000000";
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const cx = x - (side - w) / 2;
  const cy = y - (side - h) / 2;
  const back = fill ? `<rect x="${cx}" y="${cy}" width="${side}" height="${side}" fill="${bg}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cx} ${cy} ${side} ${side}" width="${size}" height="${size}">${back}${inner}</svg>`;
}

/** The PNG of the logo, `size` px square. */
export function renderSquare(svg, size, fill = true) {
  const png = new Resvg(squareSvg(svg, size, fill), { fitTo: { mode: "width", value: size } }).render();
  return { png: png.asPng(), width: png.width, height: png.height };
}

const read = (...p) => readFileSync(join(LOGO, ...p), "utf8");
const write = (file, data) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
};

export function makeIcons(outDir) {
  mkdirSync(outDir, { recursive: true });
  const icon = join(outDir, "icon.png");
  const main = renderSquare(readFileSync(LOGO_SVG, "utf8"), ICON_SIZE);
  writeFileSync(icon, main.png);

  // [id, the file of the launcher picture, the file of the preview]
  const choices = listColorful().map((n) => [n, join("colorful-full", `${n}.svg`), join("colorful", `${n}.svg`)]);
  const list = [];
  for (const [id, full, preview] of choices) {
    const names = namesOf(id);
    for (const [density, size] of Object.entries(DENSITIES)) {
      write(join(outDir, "appIcons", "launcher", `mipmap-${density}`, `${names.resource}.png`), renderSquare(read(full), size).png);
    }
    write(join(outDir, "appIcons", "preview", `${id}.png`), renderSquare(read(preview), PREVIEW_SIZE, false).png);
    list.push({
      id,
      resource: names.resource,
      alias: names.alias,
      svg: read(preview)
        .replace(/\s*\n\s*/g, " ")
        .trim(),
    });
  }
  write(
    join(outDir, "appIcons.json"),
    `${JSON.stringify(
      list.map(({ id, resource, alias }) => ({ id, resource, alias })),
      null,
      2,
    )}\n`,
  );
  write(
    join(outDir, "appIcons.ts"),
    `// Made by scripts/makeIcons.mjs; not kept in the repository.\nexport const APP_ICONS = [\n${list
      .map((i) => `  { id: ${JSON.stringify(i.id)}, preview: require("./appIcons/preview/${i.id}.png") as number, svg: ${JSON.stringify(i.svg)} },`)
      .join("\n")}\n];\n`,
  );
  return { file: icon, width: main.width, height: main.height, choices: list.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = makeIcons(resolve(process.argv[2] ?? join(here, "../.generated")));
  console.log(`${r.file} (${r.width} x ${r.height}), ${r.choices} icons to choose from`);
}
