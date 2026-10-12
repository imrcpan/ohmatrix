import { expect, test } from "vitest";
import { applyUpdates } from "./diff.js";

test("applyUpdates", () => {
  const r = applyUpdates<string>(
    [],
    [
      { op: "reset", items: ["a", "b"] },
      { op: "insert", index: 1, item: "x" },
      { op: "set", index: 0, item: "A" },
      { op: "move", from: 2, to: 0 },
      { op: "remove", index: 3 },
    ],
  );
  expect(r).toEqual(["b", "A", "x"]);
});
