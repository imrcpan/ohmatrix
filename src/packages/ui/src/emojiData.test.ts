import { expect, test } from "vitest";
import { isEmojiGlyph } from "@ohmatrix/core";
import { ALL_EMOJI_GROUPS } from "./emojiData.js";

test("every emoji the group icon picker offers is one the engines accept", () => {
  const bad = ALL_EMOJI_GROUPS.flatMap((g) => g.emojis).filter((e) => !isEmojiGlyph(e));
  expect(bad).toEqual([]);
});
