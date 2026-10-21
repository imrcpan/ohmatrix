import { Pressable, Text, View } from "react-native";
import { fontFamily, IconButton, useNavBottom, useTheme } from "@ohmatrix/ui";
import { useT } from "../context.js";
import { HEADER_HEIGHT } from "./ChatHeader.js";

/** While messages are being chosen, the bar above the chat: Cancel at the left, Copy and Forward at the right. */
export function SelectionHeader(props: { count: number; onCancel(): void; onCopy(): void; onForward(): void }) {
  const { colors } = useTheme();
  const t = useT();
  return (
    <View
      style={{
        height: HEADER_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingLeft: 20,
        paddingRight: 12,
        backgroundColor: colors.bg,
        borderBottomWidth: 1,
        borderBottomColor: colors.separator,
      }}
    >
      <Pressable accessibilityRole="button" onPress={props.onCancel} hitSlop={8} style={{ paddingVertical: 8, paddingRight: 8 }}>
        {({ pressed }: { pressed: boolean }) => (
          <Text style={{ fontSize: 17, fontWeight: "700", fontFamily, color: colors.accent, opacity: pressed ? 0.5 : 1 }}>{t("cancel")}</Text>
        )}
      </Pressable>
      <View style={{ flex: 1 }} />
      <IconButton
        icon="copy"
        label={t("copy")}
        size={22}
        color={props.count ? colors.accent : colors.textTertiary}
        onPress={() => props.count && props.onCopy()}
      />
      <IconButton
        icon="forward"
        label={t("forward")}
        size={22}
        color={props.count ? colors.accent : colors.textTertiary}
        onPress={() => props.count && props.onForward()}
      />
    </View>
  );
}

/** In the place of the message box while messages are being chosen: how many there are. */
export function SelectionBar(props: { count: number }) {
  const { colors } = useTheme();
  const t = useT();
  const nav = useNavBottom();
  return (
    <View style={{ backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.separator, zIndex: 4, paddingBottom: nav }}>
      <View style={{ minHeight: 54, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 }}>
        <Text style={{ fontSize: 18, fontFamily, color: colors.bubbleInText }}>
          {props.count === 1 ? t("selected.one") : t("selected.count", { n: props.count })}
        </Text>
      </View>
    </View>
  );
}
