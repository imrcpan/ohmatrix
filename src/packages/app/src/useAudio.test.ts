import { expect, test } from "vitest";
import { formatDuration } from "./useAudio.js";

test("formatDuration", () => {
  expect(formatDuration(undefined)).toBe("");
  expect(formatDuration(0)).toBe("0:00");
  expect(formatDuration(7300)).toBe("0:07");
  expect(formatDuration(59_600)).toBe("1:00");
  expect(formatDuration(723_000)).toBe("12:03");
  expect(formatDuration(3_723_000)).toBe("1:02:03");
});
