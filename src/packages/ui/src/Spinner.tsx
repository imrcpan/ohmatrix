import { ActivityIndicator, Platform, View } from "react-native";
import { useTheme } from "./theme.js";

/**
 * A big loading circle in the theme's colour, for a whole screen or pane that is waiting. (The small grey one in a button or a row
 * is a plain ActivityIndicator.) iOS only has a fixed "large"; elsewhere the size is a number.
 */
export function Spinner(props: { size?: number }) {
  const { colors } = useTheme();
  const size = props.size ?? 56;
  return (
    <View accessibilityRole="progressbar" style={{ alignItems: "center", justifyContent: "center", width: size, height: size }}>
      <ActivityIndicator size={Platform.OS === "ios" ? "large" : size} color={colors.accent} />
    </View>
  );
}
