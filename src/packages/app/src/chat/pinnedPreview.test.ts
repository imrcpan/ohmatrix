import { expect, test } from "vitest";
import type { TimelineItem } from "@ohmatrix/core";
import { pinnedPreview } from "./pinnedPreview.js";

const t = (k: string) => (k === "photo" ? "Photo" : k);
const item = (content: TimelineItem["content"], senderName = "Ann"): TimelineItem =>
  ({ id: "$1", sender: "@a:s", senderName, isOwn: false, ts: 1, status: "sent", content }) as TimelineItem;

test("a pinned message is its sender and its words on one line, and a picture is just Photo", () => {
  expect(pinnedPreview(item({ kind: "text", body: "line one\n\n  line two" }), t)).toBe("Ann: line one line two");
  expect(pinnedPreview(item({ kind: "image", body: "x.png", url: "mxc://s/i" } as TimelineItem["content"]), t)).toBe("Ann: Photo");
  expect(pinnedPreview(item({ kind: "text", body: "hi" }, ""), t)).toBe("hi");
  expect(pinnedPreview(item({ kind: "text", body: "x".repeat(300) }), t).length).toBe("Ann: ".length + 200);
});
