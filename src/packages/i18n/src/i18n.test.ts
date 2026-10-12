import { expect, test } from "vitest";
import { detectLocale, t } from "./index.js";

test("t", () => {
  expect(t("en", "members", { n: 3 })).toBe("3 members");
  expect(t("zh-CN", "chats")).toBe("聊天");
  expect(detectLocale("zh-Hans-CN")).toBe("zh-CN");
  expect(detectLocale("fr")).toBe("en");
});

test("a missing translation never throws", () => {
  expect(t("en", "nope.nothing" as never)).toBe("nope.nothing");
  expect(t("zh-CN", "nope.nothing" as never, { n: 1 })).toBe("nope.nothing");
  expect(t("xx" as never, "chats")).toBe("Chats");
});
