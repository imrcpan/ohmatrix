// Draws the SVG files of assets/open-emoji-cute as 256 px PNG pictures and writes them, as base64, into src/chat/openEmoji.ts.
// A phone's Image cannot draw SVG, and a sticker has to be a picture the other clients can show, so the set is kept as PNG.
//   pnpm --filter @ohmatrix/app make-open-emoji
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "assets", "open-emoji-cute");
const SIZE = 256;

// The set in the order of the repository's README (the first is the cover); the files not listed come last, by name.
const ORDER = [
  "smile",
  "laugh",
  "laugh-cry",
  "tongue",
  "playful",
  "delighted",
  "stifled-laugh",
  "angel",
  "devil",
  "blissful",
  "expressionless",
  "disdain",
  "stunned",
  "thinking",
  "huff",
  "sad",
  "wronged",
  "pitiful",
  "downcast",
  "exhausted",
  "angry",
  "furious",
  "cursing",
  "annoyed",
  "terrified",
  "vomit",
  "eye-roll",
  "puzzled",
  "awkward-laugh",
];
const names = readdirSync(dir)
  .filter((f) => f.endsWith(".svg"))
  .map((f) => f.slice(0, -4));
names.sort((a, b) => (ORDER.indexOf(a) + 1 || 1e9) - (ORDER.indexOf(b) + 1 || 1e9) || a.localeCompare(b));

const rows = names.map((name) => {
  const png = new Resvg(readFileSync(join(dir, `${name}.svg`)), { fitTo: { mode: "width", value: SIZE } }).render().asPng();
  return `  {\n    name: ${JSON.stringify(name)},\n    png: ${JSON.stringify(png.toString("base64"))},\n  },`;
});

writeFileSync(
  join(here, "..", "src", "chat", "openEmoji.ts"),
  `// Made by scripts/make-open-emoji.mjs from assets/open-emoji-cute (Apache-2.0, see assets/open-emoji-cute/NOTICE.md). Do not edit.

/** The pictures' size, in px. */
export const OPEN_EMOJI_SIZE = ${SIZE};

/** Open Emoji Cute: each emoji by name, as a PNG picture in base64. The first, \`smile\`, is the cover of the set. */
export const OPEN_EMOJI: readonly { name: string; png: string }[] = [
${rows.join("\n")}
];
`,
);
console.log(`${names.length} emoji written`);
