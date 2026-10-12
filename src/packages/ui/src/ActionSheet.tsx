import { Modal, Pressable, Text, View } from "react-native";
import { fontFamily, radius, useTheme } from "./theme.js";

export interface SheetAction {
  label: string;
  onPress: () => void;
  danger?: boolean;
}

/**
 * Message context menu: a floating emoji bar over a rounded action list (iOS context menu / Telegram),
 * opened by long-press or right-click.
 */
export function ActionSheet(props: {
  visible: boolean;
  onClose: () => void;
  emojis: readonly string[];
  activeEmojis?: readonly string[];
  onEmoji: (emoji: string) => void;
  actions: SheetAction[];
}) {
  const { colors } = useTheme();
  const done = (f: () => void) => () => {
    props.onClose();
    f();
  };
  return (
    <Modal transparent visible={props.visible} animationType="fade" onRequestClose={props.onClose}>
      <Pressable
        onPress={props.onClose}
        style={{ flex: 1, backgroundColor: colors.overlay, alignItems: "center", justifyContent: "center", padding: 24, gap: 10 }}
      >
        <View style={{ flexDirection: "row", gap: 2, padding: 6, borderRadius: radius.pill, backgroundColor: colors.bg }}>
          {props.emojis.map((e) => (
            <Pressable
              key={e}
              accessibilityRole="button"
              accessibilityLabel={`React ${e}`}
              onPress={done(() => props.onEmoji(e))}
              style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
                width: 42,
                height: 42,
                borderRadius: 21,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: props.activeEmojis?.includes(e) ? colors.bgSecondary : pressed ? colors.separator : hovered ? colors.hover : "transparent",
              })}
            >
              <Text style={{ fontSize: 26 }}>{e}</Text>
            </Pressable>
          ))}
        </View>
        {props.actions.length > 0 && (
          <View style={{ width: 240, borderRadius: 14, backgroundColor: colors.bg, overflow: "hidden" }}>
            {props.actions.map((a, i) => (
              <Pressable
                key={a.label}
                accessibilityRole="button"
                onPress={done(a.onPress)}
                style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
                  paddingHorizontal: 16,
                  height: 46,
                  justifyContent: "center",
                  borderTopWidth: i ? 1 : 0,
                  borderTopColor: colors.separator,
                  backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
                })}
              >
                <Text style={{ fontSize: 17, fontFamily, color: a.danger ? colors.danger : colors.text }}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </Pressable>
    </Modal>
  );
}

/** Reaction pills under a bubble; mine are accent-filled. */
export function ReactionChips(props: { items: { key: string; count: number; mine: boolean }[]; onToggle: (key: string) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 3 }}>
      {props.items.map((r) => (
        <Pressable
          key={r.key}
          accessibilityRole="button"
          accessibilityLabel={`${r.key} ${r.count}`}
          onPress={() => props.onToggle(r.key)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            height: 26,
            paddingHorizontal: 9,
            borderRadius: 13,
            backgroundColor: r.mine ? colors.accent : colors.bg,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ fontSize: 14 }}>{r.key}</Text>
          {r.count > 1 || !r.mine ? (
            <Text style={{ fontSize: 13, fontWeight: "600", fontFamily, color: r.mine ? colors.onAccent : colors.textSecondary }}>{r.count}</Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}
