import { FlatList, Pressable, Text, View } from "react-native";
import { fontFamily, Icon, useNavBottom, useTheme } from "@ohmatrix/ui";
import { useT } from "../context.js";
import { PageHeader } from "../settings/kit.js";
import { pinnedPreview } from "./pinnedPreview.js";
import { usePinned } from "./usePinned.js";

/** All the pinned messages of the room, newest first, as a page that slides in over the chat; pressing one goes to it. */
export function PinnedPage(props: { roomId: string; ids: readonly string[]; backLabel: string; onBack: () => void; onOpen: (eventId: string) => void }) {
  const { colors } = useTheme();
  const nav = useNavBottom();
  const t = useT();
  const ids = props.ids.slice().reverse();
  const items = usePinned(props.roomId, ids);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={`${t("pinned.title")} · ${ids.length}`} onBack={props.onBack} backLabel={props.backLabel} />
      <FlatList
        data={ids}
        keyExtractor={(id) => id}
        contentContainerStyle={{ paddingBottom: 24 + nav }}
        renderItem={({ item: id }) => {
          const m = items[id];
          return (
            <Pressable
              accessibilityRole="button"
              onPress={() => props.onOpen(id)}
              style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                marginHorizontal: 6,
                paddingHorizontal: 12,
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
              })}
            >
              <Icon name="pin" size={18} color={colors.accent} />
              <Text numberOfLines={3} style={{ flex: 1, fontSize: 15, lineHeight: 21, fontFamily, color: m ? colors.text : colors.textSecondary }}>
                {m ? pinnedPreview(m, t) : "…"}
              </Text>
              <Icon name="chevronRight" size={18} color={colors.textTertiary} />
            </Pressable>
          );
        }}
      />
    </View>
  );
}
