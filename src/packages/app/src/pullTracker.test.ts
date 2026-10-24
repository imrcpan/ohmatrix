import { describe, expect, it } from "vitest";
import { pullTracker } from "./pullTracker.js";

describe("pullTracker", () => {
  it("adds up one finger's travel from where the pull began", () => {
    const t = pullTracker();
    t.begin([{ identifier: 1, pageY: 100 }], 10);
    expect(t.move([{ identifier: 1, pageY: 130 }])).toBe(40);
    expect(t.move([{ identifier: 1, pageY: 120 }])).toBe(30);
  });

  it("ignores a second finger until the first lifts, then continues without a jump", () => {
    const t = pullTracker();
    t.begin([{ identifier: 1, pageY: 100 }], 10);
    t.move([{ identifier: 1, pageY: 150 }]);
    expect(
      t.move([
        { identifier: 1, pageY: 160 },
        { identifier: 2, pageY: 400 },
      ]),
    ).toBe(70);
    expect(t.move([{ identifier: 2, pageY: 400 }])).toBe(70);
    expect(t.move([{ identifier: 2, pageY: 430 }])).toBe(100);
  });
});
