import { expect, test, vi } from "vitest";
import type { TimelineItem } from "@ohmatrix/core";
import { bubbleProps, bubbleStatus, bubbleText, type BubbleInputs } from "./bubbleProps.js";
import type { RowActions } from "./rowActions.js";
import type { Translate } from "./types.js";

const t: Translate = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);
const item = (over: Partial<TimelineItem> = {}): TimelineItem => ({
  id: "$1",
  roomId: "!r",
  sender: "@a:s",
  senderName: "Ann",
  isOwn: false,
  ts: new Date(2026, 5, 10, 12, 0).getTime(),
  status: "sent",
  content: { kind: "text", body: "hi" },
  ...over,
});
const actions = (): RowActions => ({
  react: vi.fn(),
  pin: vi.fn(),
  forward: vi.fn(),
  addSticker: vi.fn(),
  reply: vi.fn(),
  edit: vi.fn(),
  select: vi.fn(),
  remove: vi.fn(),
  jump: vi.fn(),
  cancelUpload: vi.fn(),
  resend: vi.fn(),
  discard: vi.fn(),
  download: vi.fn(),
});
const inputs = (m: TimelineItem, over: Partial<BubbleInputs> = {}): BubbleInputs => ({
  item: m,
  pinned: false,
  first: true,
  last: true,
  stickAbove: false,
  stickBelow: false,
  showAvatar: false,
  t,
  locale: "en",
  actions: actions(),
  runs: undefined,
  openLink: vi.fn(),
  image: undefined,
  video: undefined,
  audio: { state: { status: "idle", progress: 0, positionMs: 0, durationMs: 4000 }, toggle: vi.fn() },
  previews: [],
  previewImageUrl: undefined,
  openImage: vi.fn(),
  openVideo: vi.fn(),
  ...over,
});

test("text shows its body; media shows none (they have their own parts); undecryptable shows a notice", () => {
  expect(bubbleText(item(), t)).toBe("hi");
  expect(bubbleText(item({ content: { kind: "image", url: "mxc://a/b", body: "x.png" } }), t)).toBe("");
  expect(bubbleText(item({ content: { kind: "undecryptable" } }), t)).toBe("undecryptable");
  // Only an unverified device is told to verify; the others are told what is the matter.
  expect(bubbleText(item({ content: { kind: "undecryptable", reason: "unverified" } }), t)).toBe("undecryptable");
  expect(bubbleText(item({ content: { kind: "undecryptable", reason: "waiting" } }), t)).toBe("undecryptable.waiting");
  expect(bubbleText(item({ content: { kind: "undecryptable", reason: "noBackup" } }), t)).toBe("undecryptable.noBackup");
});

test("only my own messages have a status; read once someone has read a sent one", () => {
  expect(bubbleStatus(item())).toBeUndefined();
  expect(bubbleStatus(item({ isOwn: true }))).toBe("sent");
  expect(bubbleStatus(item({ isOwn: true, status: "sending" }))).toBe("sending");
  expect(bubbleStatus(item({ isOwn: true, readBy: [{ userId: "@b:s", name: "Bob" }] }))).toBe("read");
  expect(bubbleStatus(item({ isOwn: true, status: "sending", readBy: [{ userId: "@b:s", name: "Bob" }] }))).toBe("sending");
});

test("the sender's name is shown in a group, on the first message of a run only", () => {
  expect(bubbleProps(inputs(item(), { showAvatar: true, first: true })).senderName).toBe("Ann");
  expect(bubbleProps(inputs(item(), { showAvatar: true, first: false })).senderName).toBeUndefined();
  expect(bubbleProps(inputs(item(), { showAvatar: false })).senderName).toBeUndefined();
});

test("a file stands alone and carries no sender name", () => {
  const file = item({
    content: { kind: "file", body: "a.pdf", name: "a.pdf", size: 1, mimeType: "application/pdf", url: "mxc://s/a" } as TimelineItem["content"],
  });
  expect(bubbleProps(inputs(file, { showAvatar: true, first: true })).senderName).toBeUndefined();
});

test("a reply's quote jumps to the original, and mentions and pins carry over", () => {
  const a = actions();
  const m = item({
    pinned: true,
    edited: true,
    replyTo: { id: "$orig", sender: "@b:s", senderName: "Bob", preview: "earlier" },
    content: { kind: "text", body: "x", mentionsMe: true },
  });
  const p = bubbleProps(inputs(m, { actions: a, pinned: true }));
  p.reply!.onPress();
  expect(a.jump).toHaveBeenCalledWith("$orig");
  expect(p).toMatchObject({ pinned: true, mentionsMe: true, editedLabel: "edited", muted: false });
});

test("a reply to a photo quotes its picture, and says photo instead of the file name", () => {
  const m = item({
    replyTo: { id: "$orig", sender: "@b:s", senderName: "Bob", preview: "IMG_1.png", image: { url: "mxc://s/a", width: 320, height: 200 } },
    content: { kind: "text", body: "x" },
  });
  expect(bubbleProps(inputs(m, { replyImage: "blob:thumb" })).reply).toMatchObject({ image: { uri: "blob:thumb" }, preview: "photo" });
  expect(
    bubbleProps(inputs(item({ replyTo: { id: "$o", sender: "@b:s", senderName: "Bob", preview: "hi" }, content: { kind: "text", body: "x" } }))).reply?.image,
  ).toBeUndefined();
});

test("a picture that is still uploading shows the local preview and cannot be opened; cancelling uses the transaction", () => {
  const a = actions();
  const m = item({
    isOwn: true,
    transactionId: "txn1",
    content: { kind: "image", url: "", body: "p.png" },
    upload: { progress: 0.5, loaded: 500, total: 1000, previewUrl: "blob:local" },
  });
  const p = bubbleProps(inputs(m, { actions: a, image: { uri: undefined, width: 100, height: 80 } }));
  expect(p.image).toMatchObject({ uri: "blob:local", width: 100, height: 80, onPress: undefined });
  p.upload!.onCancel();
  expect(a.cancelUpload).toHaveBeenCalledWith("txn1");
  expect(p.upload).toMatchObject({ progress: 0.5, cancelLabel: "upload.cancel" });
});

test("a finished picture opens in the viewer", () => {
  const open = vi.fn();
  const m = item({ content: { kind: "image", url: "mxc://a/b", body: "p.png" } });
  bubbleProps(inputs(m, { image: { uri: "blob:x", width: 10, height: 10 }, openImage: open })).image!.onPress!();
  expect(open).toHaveBeenCalled();
});

test("audio shows its length when idle and position / length while playing", () => {
  const m = item({ content: { kind: "audio", url: "mxc://a/b", name: "v.ogg", voice: true } });
  const idle = bubbleProps(inputs(m));
  expect(idle.audio).toMatchObject({ voice: true, timeLabel: "0:04", playLabel: "play" });
  const playing = bubbleProps(inputs(m, { audio: { state: { status: "playing", progress: 0.25, positionMs: 1000, durationMs: 4000 }, toggle: vi.fn() } }));
  expect(playing.audio).toMatchObject({ timeLabel: "0:01 / 0:04", playLabel: "pause", progress: 0.25 });
});

test("only the first link preview gets the resolved picture", () => {
  const m = item({ content: { kind: "text", body: "x" } });
  const p = bubbleProps(
    inputs(m, {
      previews: [{ url: "https://a", image: "mxc://a/1" }, { url: "https://b", image: "mxc://a/2" }, { url: "https://c" }],
      previewImageUrl: "blob:one",
    }),
  );
  expect(p.previews!.map((x) => x.image)).toEqual(["blob:one", undefined, undefined]);
});

test("a message that could not be sent can be sent again from its status mark, by its transaction", () => {
  const a = actions();
  const failed = bubbleProps(inputs(item({ isOwn: true, transactionId: "txn9", status: "failed" }), { actions: a }));
  expect(failed.status).toBe("failed");
  failed.onRetry!();
  expect(a.resend).toHaveBeenCalledWith("txn9");
  expect(failed.retryLabel).toBe("resend.failed");
  // Nothing to retry on one that went through, one still on its way, or a file whose upload has its own cancel.
  expect(bubbleProps(inputs(item({ isOwn: true, transactionId: "t", status: "sent" }))).onRetry).toBeUndefined();
  expect(bubbleProps(inputs(item({ isOwn: true, transactionId: "t", status: "sending" }))).onRetry).toBeUndefined();
  const upload = item({
    isOwn: true,
    transactionId: "u",
    status: "failed",
    content: { kind: "image", url: "", body: "p.png" },
    upload: { progress: 0.2, loaded: 200, total: 1000, failed: true },
  });
  expect(bubbleProps(inputs(upload)).onRetry).toBeUndefined();
});

test("a bubble is marked pinned by the room's list, whatever the item's own flag says", () => {
  expect(bubbleProps(inputs(item(), { pinned: true })).pinned).toBe(true);
  expect(bubbleProps(inputs({ ...item(), pinned: true }, { pinned: false })).pinned).toBe(false);
});
