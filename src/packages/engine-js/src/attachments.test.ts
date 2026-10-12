import { expect, test } from "vitest";
import { decryptAttachment, encryptAttachment } from "./attachments.js";

test("encrypt/decrypt roundtrip and tamper detection", async () => {
  const plain = new TextEncoder().encode("hello attachment ".repeat(100)).buffer as ArrayBuffer;
  const { data, info } = await encryptAttachment(plain);
  expect(new Uint8Array(data)).not.toEqual(new Uint8Array(plain));
  expect(new TextDecoder().decode(await decryptAttachment(data, info))).toBe("hello attachment ".repeat(100));
  const bad = new Uint8Array(data.slice(0));
  bad[0] = bad[0]! ^ 1;
  await expect(decryptAttachment(bad.buffer as ArrayBuffer, info)).rejects.toThrow(/hash/);
});
