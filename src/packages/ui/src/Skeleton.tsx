import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, View, type DimensionValue } from "react-native";
import { useTheme } from "./theme.js";

/** Everything inside pulses together, the way the rows of the chat list do while it is arriving. */
export function Pulse(props: { children: ReactNode }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View style={{ flexDirection: "row", alignItems: "center", gap: 10, opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }}>
      {props.children}
    </Animated.View>
  );
}

/** A grey shape where something is still to come: a circle when `circle`, else a bar with rounded ends. */
export function SkeletonBlock(props: { width: DimensionValue; height: number; circle?: boolean; color?: string | undefined }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: props.width,
        height: props.height,
        borderRadius: props.circle ? props.height / 2 : Math.min(6, props.height / 2),
        backgroundColor: props.color ?? colors.hover,
      }}
    />
  );
}
