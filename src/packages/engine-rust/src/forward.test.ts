import { expect, test } from "vitest";
import { attachmentKind, forwardContent, kindOfMime, pathOf } from "./forward.js";
import type { EventItemLike, ItemContent } from "./timelineItem.js";

const ev = (content: ItemContent): EventItemLike => ({ eventId: "$1", sender: "@a:s", isOwn: false, timestamp: 1, content });

test("a file is an image, a video, a sound or a plain file by its type", () => {
  expect(["image/png", "video/mp4", "audio/ogg", "application/pdf", ""].map(kindOfMime)).toEqual(["image", "video", "audio", "file", "file"]);
});

test("a local file is a path, however the app wrote it", () => {
  expect(pathOf("/data/a.png")).toBe("/data/a.png");
  expect(pathOf("file:///data/my%20file.png")).toBe("/data/my file.png");
  expect(pathOf({ uri: "file:///x/y" })).toBe("/x/y");
  expect(() => pathOf(null)).toThrow();
});

test("a message forwards as the content that sends it again", () => {
  expect(forwardContent(ev({ type: "text", body: "hi", formattedBody: "<b>hi</b>" }))).toEqual({
    msgtype: "m.text",
    body: "hi",
    format: "org.matrix.custom.html",
    formatted_body: "<b>hi</b>",
  });
  expect(forwardContent(ev({ type: "image", url: "mxc://s/i", body: "a.png", mimeType: "image/png", width: 2, height: 3 }))).toEqual({
    msgtype: "m.image",
    body: "a.png",
    url: "mxc://s/i",
    info: { mimetype: "image/png", w: 2, h: 3 },
  });
  expect(forwardContent(ev({ type: "file", url: "mxc://s/f", name: "r.pdf", size: 9, encryption: '{"url":"mxc://s/f","key":{"k":"x"}}' }))).toEqual({
    msgtype: "m.file",
    body: "r.pdf",
    file: { url: "mxc://s/f", key: { k: "x" } },
    info: { size: 9 },
  });
  expect(forwardContent(ev({ type: "audio", url: "mxc://s/a", name: "v", voice: true, durationMs: 1000 }))).toMatchObject({
    msgtype: "m.audio",
    "org.matrix.msc3245.voice": {},
    info: { duration: 1000 },
  });
  expect(forwardContent(ev({ type: "undecryptable" }))).toBeNull();
});

test("a file is sent as a picture, video or sound only when the SDK has what it needs of it", () => {
  expect(attachmentKind({ mimeType: "image/png", width: 4, height: 3 })).toBe("image");
  expect(attachmentKind({ mimeType: "image/png" })).toBe("file");
  expect(attachmentKind({ mimeType: "video/mp4", width: 4, height: 3, durationMs: 1000 })).toBe("video");
  expect(attachmentKind({ mimeType: "video/mp4", width: 4, height: 3 })).toBe("file");
  expect(attachmentKind({ mimeType: "audio/ogg", durationMs: 0 })).toBe("audio");
  expect(attachmentKind({ mimeType: "audio/ogg" })).toBe("file");
  expect(attachmentKind({ mimeType: "application/pdf", width: 4, height: 3 })).toBe("file");
});
