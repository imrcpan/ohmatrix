import { useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Icon } from "./Icon.js";
import { GROUPS } from "./emojiData.js";
import { stickerColumns, stickerWidth } from "./stickerColumns.js";
import { fontFamily, useTheme } from "./theme.js";

const RECENT_KEY = "ohmatrix.emoji.recent";

function loadRecent(): string[] {
  const ls = (globalThis as { localStorage?: { getItem(k: string): string | null } }).localStorage;
  try {
    const v = JSON.parse(ls?.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((e): e is string => typeof e === "string").slice(0, 24) : [];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]) {
  const ls = (globalThis as { localStorage?: { setItem(k: string, v: string): void } }).localStorage;
  try {
    ls?.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* private mode: recents are then only for this session */
  }
}

export function useRecentEmoji() {
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const remember = (emoji: string) => {
    const next = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, 24);
    setRecent(next);
    saveRecent(next);
  };
  return { recent, remember };
}

/** Emoji grid. Rendered inside a Menu or a Dialog; `onPick` receives the emoji and closes it. */
export function EmojiPicker(props: {
  onPick: (emoji: string) => void;
  recent: readonly string[];
  searchLabel: string;
  /** A tab of stickers: what it shows is the caller's (the pack is theirs); `close` shuts the picker. */
  stickers?: { label: string; render: (close: () => void) => ReactNode; grid: { tile: number; gap: number; pad: number; maxCols: number } } | undefined;
  /** The room there is for the picker, in px: the stickers' columns are fewer when it cannot hold the most, and the picker is no wider than its columns. */
  available?: number | undefined;
  close?: (() => void) | undefined;
}) {
  const { colors } = useTheme();
  const [group, setGroup] = useState(GROUPS[0]!.id);
  const [query, setQuery] = useState("");
  const all = useMemo(() => GROUPS.flatMap((g) => g.emojis), []);
  // No keyword table: filter by the group label and by the emoji itself, which is what the search box is for.
  const shown = query ? all.filter((e) => e.includes(query)) : group === "recent" ? [...props.recent] : (GROUPS.find((g) => g.id === group)?.emojis ?? []);
  const tabs = [...(props.recent.length ? [{ id: "recent", label: "🕘", emojis: [] as string[] }] : []), ...GROUPS];
  // With stickers the picker is the sticker pane alone: no emoji groups, no search, no tab bar (emoji come from the keyboard).
  if (props.stickers) {
    const grid = props.stickers.grid;
    // As many columns as fit (at most maxCols), the space between and around the tiles unchanged; the picker is exactly that wide.
    const cols = stickerColumns(grid, props.available);
    return (
      <View style={{ width: stickerWidth(grid, cols), maxHeight: 400, backgroundColor: colors.bg, borderRadius: 14, overflow: "hidden" }}>
        {props.stickers.render(() => props.close?.())}
      </View>
    );
  }
  return (
    <View style={{ width: 320, maxHeight: 340, backgroundColor: colors.bg, borderRadius: 14, overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingTop: 10 }}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={colors.textSecondary}
          accessibilityLabel={props.searchLabel}
          style={[
            {
              flex: 1,
              height: 32,
              borderRadius: 16,
              paddingHorizontal: 12,
              backgroundColor: colors.bgSecondary,
              color: colors.text,
              fontFamily,
              fontSize: 14,
            },
            { outlineStyle: "none" } as object,
          ]}
        />
      </View>
      <ScrollView contentContainerStyle={{ flexDirection: "row", flexWrap: "wrap", padding: 8, gap: 2 }}>
        {shown.map((e, i) => (
          <Pressable
            key={`${e}-${i}`}
            accessibilityRole="button"
            accessibilityLabel={`Emoji ${e}`}
            onPress={() => props.onPick(e)}
            style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
              width: 36,
              height: 36,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
            })}
          >
            <Text style={{ fontSize: 22 }}>{e}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.separator, paddingVertical: 4 }}>
        {tabs.map((g) => (
          <Pressable
            key={g.id}
            accessibilityRole="button"
            accessibilityLabel={g.label}
            accessibilityState={{ selected: g.id === group }}
            onPress={() => {
              setQuery("");
              setGroup(g.id);
            }}
            style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
              flex: 1,
              height: 32,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: pressed ? colors.separator : hovered ? colors.hover : g.id === group ? colors.bgSecondary : "transparent",
            })}
          >
            {g.id === "recent" ? <Icon name="clock" size={16} color={colors.textSecondary} /> : <Text style={{ fontSize: 16 }}>{g.emojis[0]}</Text>}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export { ALL_EMOJI_GROUPS } from "./emojiData.js";
