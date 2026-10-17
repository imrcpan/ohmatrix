import { expect, test } from "vitest";
import { avatarFileName } from "./avatarFileName.js";

test("a saved avatar is named after its owner, with the picture's own extension when the address has one", () => {
  expect(avatarFileName("ABC 三人测试", "file:///cache/x/photo.PNG")).toBe("ABC 三人测试.png");
  expect(avatarFileName("Ann", "https://h/media/a.jpeg?x=1")).toBe("Ann.jpeg");
  expect(avatarFileName("Ann", "blob:https://h/1234")).toBe("Ann");
  expect(avatarFileName("a/b:c", undefined)).toBe("a_b_c");
  expect(avatarFileName("  ", undefined)).toBe("avatar");
});
