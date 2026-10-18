import { expect, test } from "vitest";
import { MARKER, shrinkBinding } from "./shrinkBinding.mjs";

const block = (name, argc) => `    props["${name}"] = jsi::Function::createFromHostFunction(
        rt,
        jsi::PropNameID::forAscii(rt, "${name}"),
        ${argc},
        [this](jsi::Runtime &rt, const jsi::Value &thisVal, const jsi::Value *args, size_t count) -> jsi::Value {
            return this->cpp_${name}(rt, thisVal, args, count);
        }
    );
`;
const special = `    props["ubrn_rustbuffer_alloc"] = jsi::Function::createFromHostFunction(
        rt,
        jsi::PropNameID::forAscii(rt, "ubrn_rustbuffer_alloc"),
        1,
        [](jsi::Runtime &rt, const jsi::Value &thisVal, const jsi::Value *args, size_t count) -> jsi::Value {
            return jsi::Value::undefined();
        }
    );
`;
const file = (blocks) => `#include "x.hpp"

NativeThing::NativeThing(
    jsi::Runtime &rt,
    std::shared_ptr<Invoker> invoker
) : callInvoker(invoker), props() {
    // Map from Javascript names to the cpp names
${blocks.join("")}${special}}

void NativeThing::registerModule() {}
`;

test("the blocks of one shape become a table and one loop, and nothing else changes", () => {
  const src = file([block("a_one", 1), block("b_two", 2), block("c_three", 3)]);
  const r = shrinkBinding(src, 1);
  expect(r.moved).toBe(3);
  for (const [name, argc] of [
    ["a_one", 1],
    ["b_two", 2],
    ["c_three", 3],
  ])
    expect(r.source).toContain(`{"${name}", ${argc}, &NativeThing::cpp_${name}},`);
  expect(r.source.match(/\[this, fn\]/g)).toHaveLength(1); // one lambda type, not one per function
  expect(r.source).not.toContain("return this->cpp_a_one");
  expect(r.source).toContain("using Fn = jsi::Value (NativeThing::*)(");
  // The two blocks written by hand in the generator (no `this`) and the rest of the file stay.
  expect(r.source).toContain(special);
  expect(r.source).toContain("void NativeThing::registerModule() {}");
  expect(r.source).toContain(") : callInvoker(invoker), props() {");
});

test("running it again changes nothing", () => {
  const once = shrinkBinding(file([block("a_one", 1)]), 1);
  const again = shrinkBinding(once.source, 1);
  expect(again).toEqual({ source: once.source, moved: 0, already: true });
  expect(once.source).toContain(MARKER);
});

test("a file with few such blocks, or none, is left alone", () => {
  const few = file([block("a_one", 1)]);
  expect(shrinkBinding(few, 5)).toEqual({ source: few, moved: 0, already: false });
  const none = "int main() { return 0; }\n";
  expect(shrinkBinding(none, 1).moved).toBe(0);
});

test("a block that differs from the generator's shape is not moved", () => {
  const odd = block("odd_one", 1).replace("return this->", "log(); return this->");
  const r = shrinkBinding(file([block("a_one", 1), odd, block("b_two", 2)]), 1);
  expect(r.moved).toBe(2);
  expect(r.source).toContain("log(); return this->cpp_odd_one");
  expect(r.source).not.toContain('{"odd_one"');
});

test("a name is matched to its own member function and argument count", () => {
  // The name in the property, in the PropNameID and in the member function must be the same: a mismatch is left as it is.
  const mismatched = block("a_one", 1).replace('forAscii(rt, "a_one")', 'forAscii(rt, "other")');
  expect(shrinkBinding(file([mismatched]), 1).moved).toBe(0);
});
