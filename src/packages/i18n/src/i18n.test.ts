import { expect, test } from "vitest";
import { detectLocale, t } from "./index.js";

test("t", () => {
  expect(t("en", "members", { n: 3 })).toBe("3 members");
  expect(t("zh-CN", "chats")).toBe("聊天");
  expect(detectLocale("zh-Hans-CN")).toBe("zh-CN");
  expect(detectLocale("fr")).toBe("en");
});
