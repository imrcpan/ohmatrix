import { expect, test } from "vitest";
import { fromDocuments, levelOfDb, waveformOf } from "./attachments.js";

test("documents keep their name and type, and fall back to what the address says", () => {
  expect(fromDocuments([{ uri: "file:///c/a%20b.pdf", name: "a b.pdf", size: 9, mimeType: "application/pdf" }])).toEqual([
    { name: "a b.pdf", mimeType: "application/pdf", size: 9, data: "file:///c/a%20b.pdf" },
  ]);
  expect(fromDocuments([{ uri: "file:///c/x%20y", name: "" }])[0]).toMatchObject({ name: "x y", mimeType: "application/octet-stream", size: 0 });
});

test("loudness in decibels is a level between 0 and 1", () => {
  expect([levelOfDb(0), levelOfDb(-30), levelOfDb(-60), levelOfDb(-120), levelOfDb(5), levelOfDb(undefined), levelOfDb(-Infinity)]).toEqual([
    1, 0.5, 0, 0, 1, 0, 0,
  ]);
});

test("a long recording is cut to a few samples, each the loudest of its stretch", () => {
  expect(waveformOf([0.1, 0.2], 64)).toEqual([0.1, 0.2]);
  const long = Array.from({ length: 640 }, (_, i) => (i % 10 === 5 ? 0.9 : 0.1));
  const w = waveformOf(long, 64);
  expect(w).toHaveLength(64);
  expect(new Set(w)).toEqual(new Set([0.9]));
});
