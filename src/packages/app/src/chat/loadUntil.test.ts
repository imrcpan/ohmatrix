import { expect, test } from "vitest";
import { loadUntil } from "./loadUntil.js";

/** A room of `total` messages of which the newest `loaded` are in hand; each page brings `page` more. */
function room(total: number, loaded: number, page: number, wanted: number) {
  const s = { loaded, pages: 0 };
  return {
    s,
    opts: {
      has: () => total - s.loaded <= wanted, // the wanted message is `wanted` from the oldest
      paginate: async () => {
        s.pages++;
        s.loaded = Math.min(total, s.loaded + page);
      },
      count: () => s.loaded,
      wait: async () => {},
    },
  };
}

test("already there: no request is made", async () => {
  const r = room(100, 100, 30, 0);
  expect(await loadUntil(r.opts)).toBe(true);
  expect(r.s.pages).toBe(0);
});

test("pages are read until the message is in reach", async () => {
  const r = room(300, 50, 30, 0);
  expect(await loadUntil(r.opts)).toBe(true);
  expect(r.s.pages).toBe(9); // 50 + 9 * 30 = 320 >= 300
});

test("it stops at the beginning of the room when the message is not there", async () => {
  const r = room(100, 40, 30, -5); // never reachable
  expect(await loadUntil(r.opts)).toBe(false);
  expect(r.s.loaded).toBe(100);
  expect(r.s.pages).toBeLessThanOrEqual(5); // 2 pages to reach the start + 2 empty ones
});

test("it does not ask for ever", async () => {
  let asked = 0;
  const found = await loadUntil({
    has: () => false,
    paginate: async () => void asked++,
    count: () => asked, // always growing: never stalls
    wait: async () => {},
    maxRounds: 7,
  });
  expect(found).toBe(false);
  expect(asked).toBe(7);
});
