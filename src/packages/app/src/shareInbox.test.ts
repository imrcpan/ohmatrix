import { expect, test } from "vitest";
import { shareInbox } from "./shareInbox.js";

test("what is shared waits until it is cleared, and a newer share replaces it", () => {
  shareInbox.offer({ text: "one", files: [] });
  shareInbox.offer({ text: "two", files: [] });
  expect(shareInbox.current()?.text).toBe("two");
  shareInbox.clear();
  expect(shareInbox.current()).toBeNull();
});

test("listeners hear of every change", () => {
  let n = 0;
  const off = shareInbox.subscribe(() => n++);
  shareInbox.offer({ files: [] });
  shareInbox.clear();
  off();
  shareInbox.offer({ files: [] });
  expect(n).toBe(2);
  shareInbox.clear();
});
