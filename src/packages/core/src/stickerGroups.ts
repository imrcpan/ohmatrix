import { EngineError } from "./errors.js";
import { STICKER_DEFAULT_GROUP, STICKER_GROUP_FALLBACK_EMOJI, STICKER_GROUPS_MAX, type Sticker, type StickerGroup, type StickerGroupIcon } from "./types.js";

/** The account data event my sticker groups live in. Other clients do not read it: for them the pack is one list. */
export const STICKER_GROUPS_EVENT = "org.ohmatrix.sticker_groups";

const inRange = (c: number, ranges: readonly (readonly [number, number])[]) => ranges.some(([a, b]) => c >= a && c <= b);

const PICTOGRAPH: readonly (readonly [number, number])[] = [
  [0x1f000, 0x1faff], // the emoji blocks: mahjong, cards, enclosed, symbols, faces, transport, supplemental, extended
  [0x2190, 0x21ff],
  [0x2300, 0x23ff],
  [0x25a0, 0x25ff],
  [0x2600, 0x27bf],
  [0x2900, 0x297f],
  [0x2b00, 0x2bff],
];
const LOOSE = new Set([0xa9, 0xae, 0x203c, 0x2049, 0x2122, 0x2139, 0x24c2, 0x3030, 0x303d, 0x3297, 0x3299]);
const isPictograph = (c: number) => LOOSE.has(c) || inRange(c, PICTOGRAPH);
const isRegional = (c: number) => c >= 0x1f1e6 && c <= 0x1f1ff;
const isTag = (c: number) => c >= 0xe0020 && c <= 0xe007f;
const isSkin = (c: number) => c >= 0x1f3fb && c <= 0x1f3ff;

/**
 * Whether `text` is one standard emoji: a pictograph (with the colour selector, a skin tone, or joined to others by zero-width joiners), a
 * flag (two regional indicators, or a subdivision flag's tags), or a keycap. Nothing else: not a letter, not two emoji, not a space.
 * Written with code point ranges, not Unicode property escapes, which not every JavaScript engine of the phones knows.
 */
export function isEmojiGlyph(text: string): boolean {
  const cps = Array.from(text, (ch) => ch.codePointAt(0)!);
  if (cps.length === 0 || cps.length > 16) return false;
  const [first] = cps as [number, ...number[]];
  // A keycap: 0-9, # or *, the colour selector (optional), and the keycap mark.
  if ((first === 0x23 || first === 0x2a || (first >= 0x30 && first <= 0x39)) && cps.at(-1) === 0x20e3)
    return cps.length === 2 || (cps.length === 3 && cps[1] === 0xfe0f);
  // A flag: two regional indicators.
  if (isRegional(first)) return cps.length === 2 && isRegional(cps[1]!);
  let i = 0;
  while (i < cps.length) {
    if (!isPictograph(cps[i]!)) return false;
    i++;
    while (i < cps.length && (cps[i] === 0xfe0f || isSkin(cps[i]!) || isTag(cps[i]!))) i++;
    if (i === cps.length) return true;
    if (cps[i] !== 0x200d) return false;
    i++;
    if (i === cps.length) return false;
  }
  return true;
}

const iconOf = (v: unknown): StickerGroupIcon | undefined => {
  const i = v as { kind?: unknown; emoji?: unknown; url?: unknown; mimeType?: unknown } | null | undefined;
  if (i?.kind === "emoji" && typeof i.emoji === "string" && isEmojiGlyph(i.emoji)) return { kind: "emoji", emoji: i.emoji };
  if (i?.kind === "image" && typeof i.url === "string" && i.url.startsWith("mxc://") && typeof i.mimeType === "string")
    return { kind: "image", url: i.url, mimeType: i.mimeType };
  return undefined;
};

/**
 * The groups a stored value holds, made safe: those without a usable icon or id are dropped, a repeated id is dropped, so is a sticker named
 * twice (it stays in the first group), and no more than STICKER_GROUPS_MAX are kept.
 */
export function parseGroups(content: unknown): StickerGroup[] {
  const list = (content as { groups?: unknown } | null | undefined)?.groups;
  if (!Array.isArray(list)) return [];
  const ids = new Set<string>();
  const used = new Set<string>();
  const out: StickerGroup[] = [];
  for (const g of list as { id?: unknown; name?: unknown; icon?: unknown; stickers?: unknown }[]) {
    const isDefault = g?.id === STICKER_DEFAULT_GROUP;
    if (typeof g?.id !== "string" || !g.id || ids.has(g.id)) continue;
    if (!isDefault && out.filter((x) => x.id !== STICKER_DEFAULT_GROUP).length >= STICKER_GROUPS_MAX) continue;
    ids.add(g.id);
    const icon = isDefault ? undefined : iconOf(g.icon);
    const stickers = (Array.isArray(g.stickers) ? g.stickers : []).filter((s): s is string => typeof s === "string" && !used.has(s));
    const unique = [...new Set(stickers)];
    for (const s of unique) used.add(s);
    out.push({
      id: g.id,
      name: typeof g.name === "string" ? g.name.trim() : "",
      ...(icon && { icon }),
      stickers: unique,
    });
  }
  return out;
}

/** The content to store for `groups`; refuses what `parseGroups` would drop or cut, so a bad cover or too many groups is an error, not a silent loss. */
export function writeGroups(groups: readonly StickerGroup[]): { groups: StickerGroup[] } {
  if (groups.filter((g) => g.id !== STICKER_DEFAULT_GROUP).length > STICKER_GROUPS_MAX)
    throw new EngineError("unsupported", `At most ${STICKER_GROUPS_MAX} groups`);
  for (const g of groups) {
    if (g.id === STICKER_DEFAULT_GROUP && g.icon) throw new EngineError("unsupported", "The default group's cover cannot be changed");
    if (g.icon && !iconOf(g.icon)) throw new EngineError("unsupported_type", "A group's cover has to be a standard emoji or a picture");
  }
  const clean = parseGroups({ groups });
  if (clean.length !== groups.length) throw new EngineError("unknown", "The groups are not valid");
  return { groups: clean };
}

/** The groups with these stickers taken out of them (after the stickers are removed from the pack). */
export function withoutStickers(groups: readonly StickerGroup[], shortcodes: readonly string[]): StickerGroup[] {
  const gone = new Set(shortcodes);
  return groups.map((g) => (g.stickers.some((s) => gone.has(s)) ? { ...g, stickers: g.stickers.filter((s) => !gone.has(s)) } : g));
}

/** A new group id that none of `groups` has. */
export function newGroupId(groups: readonly StickerGroup[], random: () => number = Math.random): string {
  const taken = new Set(groups.map((g) => g.id));
  for (;;) {
    const id = Math.floor(random() * 36 ** 6)
      .toString(36)
      .padStart(6, "0");
    if (!taken.has(id)) return id;
  }
}

/** What a group shows as its cover: the one chosen, else its first sticker (that is in the pack), else a smiling face. */
export function coverOf(group: StickerGroup, pack: readonly Sticker[]): StickerGroupIcon {
  if (group.icon) return group.icon;
  const first = group.stickers.map((code) => pack.find((s) => s.shortcode === code)).find((s) => !!s);
  return first ? { kind: "image", url: first.url, mimeType: first.mimeType } : { kind: "emoji", emoji: STICKER_GROUP_FALLBACK_EMOJI };
}

/** The list with the item at `from` taken out and put where the item at `to` was (before it going up, after it going down); other lists are left as they are. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const out = [...list];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item as T);
  return out;
}

/**
 * The groups as the screen shows them: the default group first (made when none is stored), with the stickers no other group has, in the order
 * it kept them and the pack's order for the rest; the others as stored, without a sticker the pack no longer has.
 */
export function withDefault(stored: readonly StickerGroup[], pack: readonly Sticker[]): StickerGroup[] {
  const have = new Set(pack.map((s) => s.shortcode));
  const others = stored.filter((g) => g.id !== STICKER_DEFAULT_GROUP).map((g) => ({ ...g, stickers: g.stickers.filter((c) => have.has(c)) }));
  const taken = new Set(others.flatMap((g) => g.stickers));
  const mine = stored.find((g) => g.id === STICKER_DEFAULT_GROUP);
  const listed = (mine?.stickers ?? []).filter((c) => have.has(c) && !taken.has(c));
  const rest = pack.map((s) => s.shortcode).filter((c) => !taken.has(c) && !listed.includes(c));
  return [{ id: STICKER_DEFAULT_GROUP, name: mine?.name ?? "", stickers: [...listed, ...rest] }, ...others];
}

/**
 * The groups with sticker `code` in group `groupId` (at the end) and in no other. The default group holds what no group has, so putting
 * a sticker there takes it out of the others; an id that is no group leaves them as they are.
 */
export function placeSticker(groups: readonly StickerGroup[], code: string, groupId: string): StickerGroup[] {
  if (groupId !== STICKER_DEFAULT_GROUP && !groups.some((g) => g.id === groupId)) return [...groups];
  return groups.map((g) => {
    const rest = g.stickers.filter((x) => x !== code);
    return g.id === groupId ? { ...g, stickers: [...rest, code] } : rest.length === g.stickers.length ? g : { ...g, stickers: rest };
  });
}
