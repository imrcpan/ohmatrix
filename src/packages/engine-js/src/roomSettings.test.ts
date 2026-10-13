import { expect, test } from "vitest";
import { aliasLocalpart, thresholdsOf } from "./roomSettings.js";

test("power thresholds fall back to the spec defaults", () => {
  expect(thresholdsOf(undefined)).toEqual({ invite: 0, kick: 50, ban: 50, redact: 50, sendMessages: 0, changeSettings: 50, changeLevels: 50 });
});

test("power thresholds read the event, and the level needed to change levels is its own entry", () => {
  const t = thresholdsOf({ invite: 50, kick: 25, ban: 75, redact: 10, events_default: 5, state_default: 60, events: { "m.room.power_levels": 100 } });
  expect(t).toEqual({ invite: 50, kick: 25, ban: 75, redact: 10, sendMessages: 5, changeSettings: 60, changeLevels: 100 });
});

test("an address is lower-cased, trimmed and stripped of # and the server part", () => {
  expect(aliasLocalpart("  #My Room:example.org ")).toBe("my-room");
  expect(aliasLocalpart("team")).toBe("team");
});
