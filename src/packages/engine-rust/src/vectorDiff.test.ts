import { applyUpdates } from "@ohmatrix/core";
import { expect, test } from "vitest";
import { fromSdkDiff, fromVectorDiff, type VectorDiff } from "./vectorDiff.js";

/** Applies a batch the way the app does: through the updates `fromVectorDiff` produces. */
function run(start: string[], batches: VectorDiff<string>[][]): string[] {
  let list = start.map((s) => s.toUpperCase());
  const size = { n: list.length };
  for (const b of batches)
    list = applyUpdates(
      list,
      fromVectorDiff(b, size, (s) => s.toUpperCase()),
    );
  expect(size.n).toBe(list.length); // the count it keeps matches the list it built
  return list;
}

test("every kind of change gives the list the SDK has", () => {
  expect(run([], [[{ kind: "Reset", values: ["a", "b", "c"] }]])).toEqual(["A", "B", "C"]);
  expect(run(["a", "b"], [[{ kind: "Append", values: ["c", "d"] }]])).toEqual(["A", "B", "C", "D"]);
  expect(run(["a", "b"], [[{ kind: "PushFront", value: "z" }]])).toEqual(["Z", "A", "B"]);
  expect(run(["a", "b"], [[{ kind: "PushBack", value: "z" }]])).toEqual(["A", "B", "Z"]);
  expect(run(["a", "b", "c"], [[{ kind: "PopFront" }]])).toEqual(["B", "C"]);
  expect(run(["a", "b", "c"], [[{ kind: "PopBack" }]])).toEqual(["A", "B"]);
  expect(run(["a", "c"], [[{ kind: "Insert", index: 1, value: "b" }]])).toEqual(["A", "B", "C"]);
  expect(run(["a", "b", "c"], [[{ kind: "Set", index: 1, value: "x" }]])).toEqual(["A", "X", "C"]);
  expect(run(["a", "b", "c"], [[{ kind: "Remove", index: 1 }]])).toEqual(["A", "C"]);
  expect(run(["a", "b", "c", "d"], [[{ kind: "Truncate", length: 2 }]])).toEqual(["A", "B"]);
  expect(run(["a", "b"], [[{ kind: "Clear" }]])).toEqual([]);
});

test("a batch is applied in order, and the count carries across batches", () => {
  const out = run(
    ["a"],
    [
      [
        { kind: "PushBack", value: "b" },
        { kind: "PushFront", value: "z" },
        { kind: "Set", index: 1, value: "q" },
      ],
      [{ kind: "PopBack" }, { kind: "Append", values: ["x", "y"] }],
      [{ kind: "Truncate", length: 3 }],
    ],
  );
  expect(out).toEqual(["Z", "Q", "X"]);
});

test("truncating to the length it already has, or longer, changes nothing", () => {
  expect(run(["a", "b"], [[{ kind: "Truncate", length: 2 }]])).toEqual(["A", "B"]);
  expect(run(["a", "b"], [[{ kind: "Truncate", length: 9 }]])).toEqual(["A", "B"]);
});

test("the bindings' { tag, inner } form is read into the same changes, for all eleven variants", () => {
  const d = (tag: string, inner?: object) => fromSdkDiff<string>({ tag, inner });
  expect(d("Append", { values: ["a"] })).toEqual({ kind: "Append", values: ["a"] });
  expect(d("Clear")).toEqual({ kind: "Clear" });
  expect(d("PushFront", { value: "a" })).toEqual({ kind: "PushFront", value: "a" });
  expect(d("PushBack", { value: "a" })).toEqual({ kind: "PushBack", value: "a" });
  expect(d("PopFront")).toEqual({ kind: "PopFront" });
  expect(d("PopBack")).toEqual({ kind: "PopBack" });
  expect(d("Insert", { index: 2, value: "a" })).toEqual({ kind: "Insert", index: 2, value: "a" });
  expect(d("Set", { index: 1, value: "a" })).toEqual({ kind: "Set", index: 1, value: "a" });
  expect(d("Remove", { index: 3 })).toEqual({ kind: "Remove", index: 3 });
  expect(d("Truncate", { length: 4 })).toEqual({ kind: "Truncate", length: 4 });
  expect(d("Reset", { values: ["a", "b"] })).toEqual({ kind: "Reset", values: ["a", "b"] });
  expect(() => d("Shuffle")).toThrow(/unknown list change/);
});
