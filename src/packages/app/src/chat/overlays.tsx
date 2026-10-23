import { Pressable, Text, View } from "react-native";
import { fontFamily, Icon, popoverShadow, Spinner, useNavBottom, useTheme } from "@ohmatrix/ui";
import { HEADER_HEIGHT } from "./ChatHeader.js";

/** The composer bar's resting height: things that float above the list sit just over it. */
export const COMPOSER_HEIGHT = 62;

/** Shown in place of the list while a room's messages come in and the list settles on the newest one. */
export function LoadingOverlay({ label }: { label: string }) {
  const nav = useNavBottom();
  return (
    <View
      pointerEvents="none"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{
        position: "absolute",
        top: HEADER_HEIGHT,
        left: 0,
        right: 0,
        bottom: COMPOSER_HEIGHT + nav,
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2,
      }}
    >
      <Spinner />
    </View>
  );
}

/** A short pill at the top of the chat ("Looking for the message…"). */
export function Toast({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View
      pointerEvents="none"
      accessibilityRole="alert"
      style={{ position: "absolute", top: HEADER_HEIGHT + 10, left: 0, right: 0, alignItems: "center", zIndex: 4 }}
    >
      <View style={{ backgroundColor: colors.serviceChip, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", fontFamily, color: colors.serviceChipText }}>{text}</Text>
      </View>
    </View>
  );
}

/** The round button at the bottom right that returns to the newest message, with a count of what came meanwhile. */
export function ScrollToLatest(props: { label: string; countLabel: string; count: number; onPress(): void }) {
  const { colors, dark } = useTheme();
  const nav = useNavBottom();
  return (
    <View style={{ position: "absolute", right: 14, bottom: COMPOSER_HEIGHT + 12 + nav, zIndex: 3 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.label}
        onPress={props.onPress}
        style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => [
          {
            width: 42,
            height: 42,
            borderRadius: 21,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? colors.separator : hovered ? colors.hover : colors.bg,
          },
          popoverShadow(dark),
        ]}
      >
        <Icon name="chevronDown" size={22} color={colors.textSecondary} />
      </Pressable>
      {props.count > 0 && (
        <View
          accessibilityLabel={props.countLabel}
          style={{
            position: "absolute",
            top: -8,
            right: -4,
            minWidth: 20,
            height: 20,
            borderRadius: 10,
            paddingHorizontal: 5,
            backgroundColor: colors.badge,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "700", fontFamily, color: colors.onAccent }}>{props.count > 99 ? "99+" : props.count}</Text>
        </View>
      )}
    </View>
  );
}

/** A dashed frame over the chat while files are dragged over the window. */
export function DropOverlay({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 6,
        margin: 10,
        borderRadius: 16,
        borderWidth: 2,
        borderStyle: "dashed",
        borderColor: colors.accent,
        backgroundColor: colors.overlay,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon name="attach" size={40} color={colors.accent} />
      <Text style={{ marginTop: 10, fontSize: 17, fontWeight: "600", fontFamily, color: colors.text }}>{label}</Text>
    </View>
  );
}
