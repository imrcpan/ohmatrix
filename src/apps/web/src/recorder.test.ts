import { expect, test } from "vitest";
import { toWaveform } from "./recorder.js";

test("waveform: fixed number of bars, loudest = 1, quiet stays quiet", () => {
  expect(toWaveform([])).toEqual([]);
  const w = toWaveform(Array.from({ length: 200 }, (_, i) => (i % 40 < 5 ? 0.9 : 0.1)));
  expect(w).toHaveLength(64);
  expect(Math.max(...w)).toBe(1);
  expect(Math.min(...w)).toBeLessThan(0.3);
  expect(toWaveform([0.5])).toHaveLength(64);
  expect(toWaveform([0, 0, 0]).every((v) => v === 0)).toBe(true);
});
