import { describe, expect, it } from "vitest";
import { decryptMegolmExport, encryptMegolmExport } from "./megolmExport.js";

const keys = JSON.stringify([{ algorithm: "m.megolm.v1.aes-sha2", room_id: "!a:x", session_id: "s", session_key: "k" }]);

describe("the key export file", () => {
  it("opens with the passphrase it was made with", async () => {
    const file = await encryptMegolmExport(keys, "correct horse", 1000);
    expect(file.startsWith("-----BEGIN MEGOLM SESSION DATA-----\n")).toBe(true);
    expect(file.endsWith("\n-----END MEGOLM SESSION DATA-----")).toBe(true);
    expect(await decryptMegolmExport(file, "correct horse")).toBe(keys);
  });

  it("is refused with another passphrase", async () => {
    const file = await encryptMegolmExport(keys, "correct horse", 1000);
    await expect(decryptMegolmExport(file, "battery staple")).rejects.toThrow("wrong passphrase");
  });

  it("is refused when a byte of it was changed", async () => {
    const file = await encryptMegolmExport(keys, "correct horse", 1000);
    const lines = file.split("\n");
    lines[2] = lines[2]!.startsWith("A") ? "B" + lines[2]!.slice(1) : "A" + lines[2]!.slice(1);
    await expect(decryptMegolmExport(lines.join("\n"), "correct horse")).rejects.toThrow("wrong passphrase");
  });

  it("is refused when it is not an export file at all", async () => {
    await expect(decryptMegolmExport("hello", "x")).rejects.toThrow("not a key export file");
  });

  it("wraps the base64 at 64 characters", async () => {
    const file = await encryptMegolmExport(keys, "p", 1000);
    const body = file.split("\n").slice(1, -1);
    expect(body.every((l, i) => (i === body.length - 1 ? l.length <= 64 : l.length === 64))).toBe(true);
  });
});
