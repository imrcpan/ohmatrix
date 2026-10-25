import { afterEach, expect, test, vi } from "vitest";
import { clearLog, logLine, logLines, logText, onLog } from "./log.js";

afterEach(() => clearLog());

test("a line is kept with its level and time, and the lines come oldest first", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T08:09:10.123Z"));
  logLine("log", "first");
  logLine("warn", "second", 2, { a: 1 });
  vi.useRealTimers();
  const all = logLines();
  expect(all.map((l) => [l.level, l.text])).toEqual([
    ["log", "first"],
    ["warn", 'second 2 {"a":1}'],
  ]);
  expect(all[0]!.id).toBeLessThan(all[1]!.id);
  expect(logText()).toBe('08:09:10.123 LOG   first\n08:09:10.123 WARN  second 2 {"a":1}');
});

test("an error is shown with its stack, and a value that cannot be written out does not stop the log", () => {
  logLine("error", new Error("boom"));
  const circular: Record<string, unknown> = {};
  circular["self"] = circular;
  logLine("log", circular);
  const [first, second] = logLines();
  expect(first!.text).toContain("boom");
  expect(second!.text).toBe("[object Object]");
});

test("only the last lines are kept, and one line is cut when it is very long", () => {
  for (let i = 0; i < 2100; i++) logLine("log", `line ${i}`);
  const all = logLines();
  expect(all).toHaveLength(2000);
  expect(all[0]!.text).toBe("line 100");
  expect(all.at(-1)!.text).toBe("line 2099");
  logLine("log", "x".repeat(5000));
  expect(logLines().at(-1)!.text).toMatch(/^x{4000}… \(1000 more characters\)$/);
});

test("the lines are a new array only when the log changed, and the listener is called for each change until it is removed", () => {
  const cb = vi.fn();
  const off = onLog(cb);
  const before = logLines();
  expect(logLines()).toBe(before);
  logLine("info", "a");
  expect(cb).toHaveBeenCalledTimes(1);
  expect(logLines()).not.toBe(before);
  clearLog();
  expect(cb).toHaveBeenCalledTimes(2);
  expect(logLines()).toHaveLength(0);
  off();
  logLine("info", "b");
  expect(cb).toHaveBeenCalledTimes(2);
});

test("describeError keeps the fields an error carries and what caused it", async () => {
  const { describeError } = await import("./log.js");
  const root = Object.assign(new Error("connection refused"), { tag: "Generic", inner: { msg: "error sending request", details: "dns" } });
  const top = new Error("join failed", { cause: root });
  const text = describeError(top);
  expect(text).toContain("Error: join failed");
  expect(text).toContain("caused by: Error: connection refused");
  expect(text).toContain('"tag":"Generic"');
  expect(text).toContain('"details":"dns"');
});
