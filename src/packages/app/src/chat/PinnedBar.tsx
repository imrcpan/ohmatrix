import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { fontFamily, Icon, useTheme } from "@ohmatrix/ui";
import { useT } from "../context.js";
import { pinnedPreview } from "./pinnedPreview.js";
import { usePinned } from "./usePinned.js";

/**
 * The pinned messages of the room, under the chat's header, drawn like the bar of a message being edited: the newest first (with "n/total"
 * when there are several), one line of it. Pressing it goes to that message and moves on to the next one (older), round and round;
 * the button at the right opens the page with all of them.
 */
export function PinnedBar(props: { roomId: string; ids: readonly string[]; onJump: (eventId: string) => void; onAll: () => void }) {
  const { colors } = useTheme();
  const t = useT();
  const [at, setAt] = useState(0);
  const ids = useMemo(() => props.ids.slice().reverse(), [props.ids]);
  const index = Math.min(at, ids.length - 1);
  const id = ids[index];
  const items = usePinned(props.roomId, id === undefined ? [] : [id]);
  useEffect(() => setAt(0), [props.roomId]);

  if (id === undefined) return null;
  const item = items[id];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: colors.bg,
        borderBottomWidth: 1,
        borderBottomColor: colors.separator,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("pinned.title")}
        onPress={() => {
          props.onJump(id);
          setAt((index + 1) % ids.length);
        }}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 }}
      >
        <Icon name="pin" size={20} color={colors.accent} />
        <View style={{ width: 2, alignSelf: "stretch", borderRadius: 1, backgroundColor: colors.accent }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", fontFamily, color: colors.accent }}>
            {ids.length > 1 ? `${t("pinned.title")} · ${index + 1}/${ids.length}` : t("pinned.title")}
          </Text>
          <Text numberOfLines={1} style={{ fontSize: 14, fontFamily, color: colors.textSecondary }}>
            {item ? pinnedPreview(item, t) : "…"}
          </Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={t("pinned.all")} onPress={props.onAll} hitSlop={8}>
        <Icon name="chevronRight" size={20} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}
