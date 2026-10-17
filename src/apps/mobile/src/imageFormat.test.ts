import { expect, test } from "vitest";
import { sniffImageExtension } from "./imageFormat.js";

test("a picture's format is told from its first bytes", () => {
  expect(sniffImageExtension(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe("png");
  expect(sniffImageExtension(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
  expect(sniffImageExtension(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("gif");
  expect(sniffImageExtension(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("webp");
  expect(sniffImageExtension(new Uint8Array([1, 2, 3]))).toBeUndefined();
  expect(sniffImageExtension(new Uint8Array([]))).toBeUndefined();
});
