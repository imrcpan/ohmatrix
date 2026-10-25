import { expect, test } from "vitest";
import { serverName } from "./serverName.js";

test("a typed server is cut down to its name", () => {
  expect(serverName(" KDE.org ")).toBe("kde.org");
  expect(serverName("https://matrix.org/_matrix/client")).toBe("matrix.org");
  expect(serverName("#room:fedora.im")).toBe("fedora.im");
  expect(serverName("example.org:8448")).toBe("example.org:8448");
  expect(serverName("")).toBeNull();
  expect(serverName("not a server")).toBeNull();
});
