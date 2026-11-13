import { describe, expect, it } from "vitest";
import {
  coverOf,
  placeSticker,
  isEmojiGlyph,
  moveItem,
  newGroupId,
  parseGroups,
  withDefault,
  withUngrouped,
  withoutStickers,
  writeGroups,
} from "./stickerGroups.js";
import { STICKER_GROUPS_MAX, type StickerGroup } from "./types.js";

const g = (id: string, stickers: string[] = [], emoji = "😀"): StickerGroup => ({ id, name: `Group ${id}`, icon: { kind: "emoji", emoji }, stickers });

describe("isEmojiGlyph", () => {
  it("takes one standard emoji in its forms", () => {
    for (const e of ["😀", "❤", "❤️", "👍🏽", "👨‍👩‍👧", "🏳️‍🌈", "🇨🇳", "1️⃣", "#️⃣", "©", "™", "⭐", "🐶", "🏴󠁧󠁢󠁥󠁮󠁧󠁿"]) expect(isEmojiGlyph(e), e).toBe(true);
  });
  it("refuses anything else", () => {
    for (const e of ["", "a", "ab", "好", "😀😀", " 😀", "😀 ", "1", "🇨", "🇨🇳🇨", "👨‍", "x😀", "<b>", "😀‍"]) expect(isEmojiGlyph(e), e).toBe(false);
  });
});

describe("sticker groups", () => {
  it("reads groups, dropping what cannot be used, a repeated id, a sticker named twice, and what is over the limit", () => {
    const content = {
      groups: [
        { id: "a", icon: { kind: "emoji", emoji: "😀" }, stickers: ["x", "y", "x"] },
        { id: "a", icon: { kind: "emoji", emoji: "🐶" }, stickers: [] },
        { id: "b", icon: { kind: "emoji", emoji: "word" }, stickers: [] },
        { id: "c", icon: { kind: "image", url: "mxc://h/i", mimeType: "image/png" }, stickers: ["y", "z"] },
        { id: "d", icon: { kind: "image", url: "https://x/y", mimeType: "image/png" }, stickers: [] },
        { id: "", icon: { kind: "emoji", emoji: "😀" }, stickers: [] },
        { id: "e", name: "  a very long name indeed  ", stickers: [] },
      ],
    };
    expect(parseGroups(content)).toEqual([
      { id: "a", name: "", icon: { kind: "emoji", emoji: "😀" }, stickers: ["x", "y"] },
      // A cover that cannot be used is dropped, not the group: it falls back to its first sticker.
      { id: "b", name: "", stickers: [] },
      { id: "c", name: "", icon: { kind: "image", url: "mxc://h/i", mimeType: "image/png" }, stickers: ["z"] },
      { id: "d", name: "", stickers: [] },
      { id: "e", name: "a very long name indeed", stickers: [] },
    ]);
    expect(parseGroups(undefined)).toEqual([]);
    const many = { groups: Array.from({ length: 20 }, (_, n) => g(`g${n}`)) };
    expect(parseGroups(many)).toHaveLength(STICKER_GROUPS_MAX);
  });

  it("refuses to write a bad cover or too many groups, and gives back what it reads", () => {
    expect(() => writeGroups([g("a", [], "word")])).toThrow(expect.objectContaining({ code: "unsupported_type" }));
    expect(() => writeGroups([{ id: "a", name: "好".repeat(12), stickers: [] }])).not.toThrow();
    expect(() => writeGroups(Array.from({ length: STICKER_GROUPS_MAX + 1 }, (_, n) => g(`g${n}`)))).toThrow(expect.objectContaining({ code: "unsupported" }));
    expect(() => writeGroups([g("a"), g("a")])).toThrow();
    const ok = [g("a", ["x"]), g("b", ["y"], "🐶")];
    expect(parseGroups(writeGroups(ok))).toEqual(ok);
  });

  it("takes removed stickers out of the groups", () => {
    expect(withoutStickers([g("a", ["x", "y"]), g("b", ["z"])], ["y", "nope"])).toEqual([g("a", ["x"]), g("b", ["z"])]);
  });

  it("shows the chosen cover, else the first sticker of the pack, else the playful face of Open Emoji Cute", () => {
    const pack = [{ shortcode: "x", url: "mxc://h/x", mimeType: "image/gif" }];
    expect(coverOf(g("a", ["x"]), pack)).toEqual({ kind: "emoji", emoji: "😀" });
    const bare = { id: "b", name: "", stickers: ["gone", "x"] };
    expect(coverOf(bare, pack)).toEqual({ kind: "image", url: "mxc://h/x", mimeType: "image/gif" });
    expect(coverOf({ ...bare, stickers: [] }, pack)).toEqual({ kind: "builtin", name: "playful" });
    expect(coverOf({ ...bare, stickers: ["gone"] }, pack)).toEqual({ kind: "builtin", name: "playful" });
  });

  it("puts the group of the stickers no group has first; it may have a cover like the others", () => {
    const pack = ["a", "b", "c", "d"].map((shortcode) => ({ shortcode, url: `mxc://h/${shortcode}`, mimeType: "image/png" }));
    const stored = [g("g1", ["b", "gone"]), { id: "default", name: "Mine", stickers: ["d", "b", "x"] }];
    expect(withDefault(stored, pack).map((x) => [x.id, x.name, x.stickers])).toEqual([
      ["default", "Mine", ["d", "a", "c"]],
      ["g1", "Group g1", ["b"]],
    ]);
    expect(withDefault([], pack)[0]).toEqual({ id: "default", name: "", stickers: ["a", "b", "c", "d"] });
    const covered = { id: "default", name: "", icon: { kind: "emoji" as const, emoji: "😀" }, stickers: [] };
    expect(parseGroups({ groups: [covered] })[0]).toHaveProperty("icon", covered.icon);
    expect(() => writeGroups([covered])).not.toThrow();
    expect(withDefault([covered], pack)[0]).toHaveProperty("icon", covered.icon);
    const many = [{ id: "default", name: "", stickers: [] }, ...Array.from({ length: STICKER_GROUPS_MAX }, (_, n) => g(`g${n}`))];
    expect(() => writeGroups(many)).not.toThrow();
  });

  it("shows the group of the stickers no group has only while it has something: a sticker, a name or a cover", () => {
    const pack = ["a", "b"].map((shortcode) => ({ shortcode, url: `mxc://h/${shortcode}`, mimeType: "image/png" }));
    // Nothing is in no group: only mine.
    expect(withUngrouped([g("g1", ["a", "b"])], pack).map((x) => x.id)).toEqual(["g1"]);
    expect(withUngrouped([], []).map((x) => x.id)).toEqual([]);
    // A sticker that no group has makes the group show, first.
    expect(withUngrouped([g("g1", ["a"])], pack).map((x) => [x.id, x.stickers])).toEqual([
      ["default", ["b"]],
      ["g1", ["a"]],
    ]);
    // Emptied, it stays while it has a name or a cover.
    const all = [g("g1", ["a", "b"])];
    expect(withUngrouped([{ id: "default", name: "Mine", stickers: [] }, ...all], pack).map((x) => x.id)).toEqual(["default", "g1"]);
    expect(withUngrouped([{ id: "default", name: "", icon: { kind: "emoji", emoji: "😀" }, stickers: [] }, ...all], pack).map((x) => x.id)).toEqual([
      "default",
      "g1",
    ]);
  });

  it("places a sticker in one group and no other", () => {
    const groups = [g("a", ["x"]), g("b", ["y", "z"])];
    expect(placeSticker(groups, "new", "b").map((x) => x.stickers)).toEqual([["x"], ["y", "z", "new"]]);
    expect(placeSticker(groups, "x", "b").map((x) => x.stickers)).toEqual([[], ["y", "z", "x"]]);
    expect(placeSticker(groups, "y", "default").map((x) => x.stickers)).toEqual([["x"], ["z"]]);
    expect(placeSticker(groups, "x", "nope")).toEqual(groups);
  });

  it("moves an item to another place in the list", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });

  it("makes ids the groups do not have", () => {
    const rolls = [0, 0.5];
    const id = newGroupId([g("000000")], () => rolls.shift()!);
    expect(id).not.toBe("000000");
    expect(rolls).toEqual([]);
    expect(newGroupId([], () => 0.5)).toMatch(/^[0-9a-z]{6}$/);
  });
});
