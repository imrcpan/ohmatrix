import { Pressable, View } from "react-native";
import { useTheme } from "./theme.js";

/** iOS-style switch: pill track with a white knob; the accent colour when on. */
export function Toggle(props: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={props.label}
      aria-checked={props.value}
      aria-disabled={!!props.disabled}
      accessibilityState={{ checked: props.value, disabled: !!props.disabled }}
      disabled={props.disabled}
      onPress={() => props.onChange(!props.value)}
      hitSlop={6}
      style={{
        width: 51,
        height: 31,
        borderRadius: 16,
        padding: 2,
        justifyContent: "center",
        opacity: props.disabled ? 0.5 : 1,
        backgroundColor: props.value ? colors.accent : colors.textTertiary,
      }}
    >
      <View style={{ width: 27, height: 27, borderRadius: 14, backgroundColor: "#FFFFFF", alignSelf: props.value ? "flex-end" : "flex-start" }} />
    </Pressable>
  );
}
