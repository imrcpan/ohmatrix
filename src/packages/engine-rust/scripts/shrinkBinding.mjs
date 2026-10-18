// Makes the C++ that uniffi generates for the Matrix SDK cheap to compile.
//
// The generator writes the constructor of NativeMatrixSdkFfi as one block per SDK function, about 1,400 of them in a row:
//
//   props["ubrn_..."] = jsi::Function::createFromHostFunction(rt, jsi::PropNameID::forAscii(rt, "ubrn_..."), 2,
//       [this](jsi::Runtime &rt, ...) -> jsi::Value { return this->cpp_...(rt, thisVal, args, count); });
//
// Every block is a lambda of a type of its own, and clang needs about 2.8 MB for each one: 5.2 GB just to read the file, 7.3 GB to
// compile it (measured), which does not fit a 16 GB machine next to Gradle. The blocks differ only in the name, the number of
// arguments and the member function, so they are replaced by one table and one loop, with a single lambda type: 1.3 GB to read the
// file, 1.5 GB to compile it, and the object code is smaller. What gets registered is the same.
//
//   node scripts/shrinkBinding.mjs cpp/generated

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** Below this many blocks a file is left as it is: it is not the one that is expensive. */
export const MIN_BLOCKS = 100;
/** A generated file this long that has no such blocks means the generator's output changed and this no longer helps. */
const BIG_FILE_LINES = 20000;
export const MARKER = "// The functions below are registered from a table (scripts/shrinkBinding.mjs), not one lambda each.";

// Exactly the shape the generator writes. A block that differs in any way is not touched.
const BLOCK =
  /^ {4}props\["(\w+)"\] = jsi::Function::createFromHostFunction\(\n {8}rt,\n {8}jsi::PropNameID::forAscii\(rt, "\1"\),\n {8}(\d+),\n {8}\[this\]\(jsi::Runtime &rt, const jsi::Value &thisVal, const jsi::Value \*args, size_t count\) -> jsi::Value \{\n {12}return this->(cpp_\w+)\(rt, thisVal, args, count\);\n {8}\}\n {4}\);\n/gm;

/**
 * @param {string} source the text of a generated .cpp file
 * @param {number} [minBlocks]
 * @returns {{ source: string, moved: number, already: boolean }} `moved` blocks were turned into table entries
 */
export function shrinkBinding(source, minBlocks = MIN_BLOCKS) {
  if (source.includes(MARKER)) return { source, moved: 0, already: true };
  const klass = /^(\w+)::\1\(\s*jsi::Runtime/m.exec(source)?.[1];
  const blocks = [...source.matchAll(BLOCK)];
  if (!klass || blocks.length < minBlocks) return { source, moved: 0, already: false };

  const entries = blocks.map((m) => `            {"${m[1]}", ${m[2]}, &${klass}::${m[3]}},\n`).join("");
  const table = `    ${MARKER}
    {
        using Fn = jsi::Value (${klass}::*)(jsi::Runtime &, const jsi::Value &, const jsi::Value *, size_t);
        struct Entry { const char *name; unsigned int argc; Fn fn; };
        static const Entry entries[] = {
${entries}        };
        for (const auto &e : entries) {
            Fn fn = e.fn;
            props[e.name] = jsi::Function::createFromHostFunction(
                rt,
                jsi::PropNameID::forAscii(rt, e.name),
                e.argc,
                [this, fn](jsi::Runtime &rt, const jsi::Value &thisVal, const jsi::Value *args, size_t count) -> jsi::Value {
                    return (this->*fn)(rt, thisVal, args, count);
                }
            );
        }
    }
`;
  let out = "";
  let last = 0;
  blocks.forEach((m, i) => {
    out += source.slice(last, m.index);
    if (i === 0) out += table;
    last = m.index + m[0].length;
  });
  out += source.slice(last);
  return { source: out, moved: blocks.length, already: false };
}

function main(dir) {
  let failed = false;
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".cpp"))) {
    const path = join(dir, name);
    const text = readFileSync(path, "utf8");
    const r = shrinkBinding(text);
    if (r.already) console.log(`${name}: already done`);
    else if (r.moved > 0) {
      writeFileSync(path, r.source);
      console.log(`${name}: ${r.moved} functions now registered from a table`);
    } else if (text.split("\n").length > BIG_FILE_LINES) {
      console.error(
        `${name}: ${text.split("\n").length} lines and none of the blocks this expects: the generator's output has changed, so this file is as expensive to compile as before`,
      );
      failed = true;
    }
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) {
    console.error("usage: node scripts/shrinkBinding.mjs <directory of generated .cpp files>");
    process.exit(2);
  }
  main(process.argv[2]);
}
