import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable } from "react-native";
import { useTheme } from "@ohmatrix/ui";

const BEZIER = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * The left pane as a panel floating over the whole window, from the left edge: when the chat list is only a strip of pictures there is no
 * list for the profile and the settings to cover, and they do not push the chat aside. The rest of the window is shaded, and pressing it
 * closes the panel. Stays mounted only while open or sliding out.
 */
export function FloatingSidebar(props: { open: boolean; width: number; onClose: () => void; children: ReactNode }) {
  const { colors } = useTheme();
  const progress = useRef(new Animated.Value(props.open ? 1 : 0)).current;
  const [mounted, setMounted] = useState(props.open);
  useEffect(() => {
    if (props.open) setMounted(true);
    Animated.timing(progress, { toValue: props.open ? 1 : 0, duration: 240, easing: BEZIER, useNativeDriver: false }).start(({ finished }) => {
      if (finished && !props.open) setMounted(false);
    });
  }, [props.open, progress]);
  if (!mounted) return null;
  return (
    <Animated.View
      pointerEvents={props.open ? "auto" : "none"}
      // Above the chat, its composer and the divider.
      style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, zIndex: 100, elevation: 100 }}
    >
      <Animated.View style={{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0, opacity: progress, backgroundColor: "rgba(0,0,0,0.4)" }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={props.onClose} style={{ flex: 1 }} />
      </Animated.View>
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: props.width,
          backgroundColor: colors.bg,
          overflow: "hidden",
          transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-props.width, 0] }) }],
          ...({ boxShadow: "6px 0 24px rgba(0,0,0,0.35)" } as object),
        }}
      >
        {props.children}
      </Animated.View>
    </Animated.View>
  );
}
