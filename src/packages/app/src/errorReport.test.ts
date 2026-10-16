import { expect, test } from "vitest";
import { errorReport } from "./errorReport.js";

const NOW = new Date(Date.UTC(2026, 9, 17, 8, 0, 0));

test("the report says when, what was thrown and where it was drawn", () => {
  const e = new Error("boom");
  e.stack = "Error: boom\n    at render (app.js:1:1)";
  const r = errorReport(e, "\n    at Chat\n    at App", NOW);
  expect(r.split("\n")[0]).toBe("OhMatrix error report");
  expect(r).toContain("time: 2026-10-17T08:00:00.000Z");
  expect(r).toContain("Error: boom\n    at render (app.js:1:1)");
  expect(r).toContain("Component stack:\nat Chat\n    at App");
});

test("a stack that lacks the message gets it put in front, and the cause is shown", () => {
  const e = new TypeError("bad", { cause: new Error("root") });
  e.stack = "    at a (x.js:1:1)";
  const r = errorReport(e, undefined, NOW);
  expect(r).toContain("TypeError: bad\n    at a (x.js:1:1)");
  expect(r).toContain("Caused by:");
  expect(r).toContain("root");
  expect(r).not.toContain("Component stack");
});

test("anything thrown is reported, and long stacks are cut", () => {
  expect(errorReport("just text", null, NOW)).toContain("just text");
  const e = new Error("x");
  e.stack = `Error: x\n${"    at f (a.js:1:1)\n".repeat(500)}`;
  const r = errorReport(e, null, NOW);
  expect(r).toContain("more characters)");
  expect(r.length).toBeLessThan(3500);
});
