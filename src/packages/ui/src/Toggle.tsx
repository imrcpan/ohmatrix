import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, Pressable } from "react-native";
import { useTheme } from "./theme.js";

const W = 50;
const H = 28;
const PAD = 2;
const KNOB_W = H - PAD * 2;
const KNOB_H = H - PAD * 2;
const TRAVEL = W - KNOB_W - PAD * 2;

/**
 * Switch in the newest Apple style: a low, wide track and a round white knob like a drop of glass, with a soft shadow, that slides across.
 * Off, the track is a pale grey; on, it takes the accent colour.
 */
export function Toggle(props: { value: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  const { colors, dark } = useTheme();
  const native = Platform.OS !== "web";
  const progress = useRef(new Animated.Value(props.value ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: props.value ? 1 : 0, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: native }).start();
  }, [props.value, progress, native]);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={props.label}
      aria-checked={props.value}
      aria-disabled={!!props.disabled}
      accessibilityState={{ checked: props.value, disabled: !!props.disabled }}
      disabled={props.disabled}
      onPress={() => props.onChange(!props.value)}
      hitSlop={8}
      style={{
        width: W,
        height: H,
        borderRadius: H / 2,
        opacity: props.disabled ? 0.5 : 1,
        backgroundColor: dark ? "rgba(120,120,128,0.36)" : "rgba(120,120,128,0.24)",
      }}
    >
      <Animated.View
        style={{ position: "absolute", left: 0, top: 0, width: W, height: H, borderRadius: H / 2, backgroundColor: colors.accent, opacity: progress }}
      />
      <Animated.View
        style={{
          position: "absolute",
          left: PAD,
          top: PAD,
          width: KNOB_W,
          height: KNOB_H,
          borderRadius: KNOB_H / 2,
          backgroundColor: "#FFFFFF",
          shadowColor: "#000000",
          shadowOpacity: 0.22,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 1 },
          elevation: 2,
          transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, TRAVEL] }) }],
        }}
      />
    </Pressable>
  );
}
