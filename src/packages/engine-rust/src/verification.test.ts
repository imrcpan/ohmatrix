import { expect, test } from "vitest";
import { flowAfter, outgoing } from "./verification.js";

const emojis = [{ symbol: "🐶", name: "Dog" }];

test("a request from another device asks me; accepting it leads to the pictures and to done", () => {
  let f = flowAfter(null, { kind: "request", userId: "@me:s", flowId: "f", deviceName: "Laptop" });
  expect(f).toEqual({ phase: "requested", incoming: true, userId: "@me:s", deviceName: "Laptop" });
  f = flowAfter(f, { kind: "started" });
  expect(f).toEqual({ phase: "waiting", userId: "@me:s" });
  f = flowAfter(f, { kind: "emojis", emojis });
  expect(f).toEqual({ phase: "emojis", userId: "@me:s", emojis });
  expect(flowAfter(f, { kind: "finished" })).toEqual({ phase: "done", userId: "@me:s" });
});

test("my own request waits until the other side accepts", () => {
  const f = flowAfter(outgoing("@bob:s"), { kind: "accepted" });
  expect(f).toEqual({ phase: "waiting", userId: "@bob:s" });
});

test("late events of a verification that is gone, or already done, change nothing", () => {
  expect(flowAfter(null, { kind: "accepted" })).toBeNull();
  expect(flowAfter(null, { kind: "emojis", emojis })).toBeNull();
  const done = { phase: "done", userId: "@a:s" } as const;
  expect(flowAfter(done, { kind: "cancelled" })).toBe(done);
  expect(flowAfter(done, { kind: "failed" })).toBe(done);
  expect(flowAfter(done, { kind: "accepted" })).toBe(done);
});

test("cancelled and failed are kept for the screen to show", () => {
  expect(flowAfter(outgoing("@a:s"), { kind: "cancelled" })).toEqual({ phase: "cancelled", userId: "@a:s" });
  expect(flowAfter(outgoing("@a:s"), { kind: "failed" })).toEqual({ phase: "failed", userId: "@a:s" });
});
