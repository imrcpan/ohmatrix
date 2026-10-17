import { Text, View } from "react-native";
import { Icon } from "./Icon.js";
import { fontFamily, useTheme } from "./theme.js";

/**
 * A short message in a pill at the top of the screen, in plain sight: the theme's own surface (light or dark) with an
 * outline and a mark (a check for good news, a cross for an error). The caller decides how long it stays and what `top`
 * clears (the status bar, a header).
 */
export function TopNotice(props: { message: string; kind?: "success" | "error"; top: number }) {
  const { colors } = useTheme();
  const error = props.kind === "error";
  return (
    <View
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      style={{
        position: "absolute",
        top: props.top,
        alignSelf: "center",
        maxWidth: "92%",
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingLeft: 12,
        paddingRight: 18,
        paddingVertical: 10,
        borderRadius: 24,
        backgroundColor: colors.bg,
        borderWidth: 1,
        borderColor: "rgba(128,128,128,0.5)",
        shadowColor: "#000000",
        shadowOpacity: 0.35,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 8,
        zIndex: 50,
      }}
    >
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: error ? "#FF3B30" : "#34C759", alignItems: "center", justifyContent: "center" }}>
        <Icon name={error ? "close" : "check"} size={16} strokeWidth={3} color="#FFFFFF" />
      </View>
      <Text numberOfLines={3} style={{ flexShrink: 1, fontSize: 16, fontWeight: "600", fontFamily, color: colors.text }}>
        {props.message}
      </Text>
    </View>
  );
}
