import { expect, test } from "vitest";
import { stripReplyFallback } from "./replyFallback.js";

test("the quote a reply carries in its body is taken off, so a quote of a reply shows only what it says", () => {
  expect(stripReplyFallback("> <@a:x> Yeah good luck\n\nor auto")).toBe("or auto");
  expect(stripReplyFallback("> <@a:x> one\n> two\n\n\nanswer")).toBe("answer");
  expect(stripReplyFallback("plain\n\ntext")).toBe("plain\n\ntext");
  expect(stripReplyFallback("> only a quote")).toBe("> only a quote");
});
