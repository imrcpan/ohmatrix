import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Pressable, View } from "react-native";
import { useTheme } from "@ohmatrix/ui";

const BEZIER = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * Panel that slides in from the right edge.
 * - `dock`: sits beside the content and pushes it narrower (landscape).
 * - `overlay`: covers the content full-size (portrait).
 * - `float`: a panel of `width` against the right edge, over the content, which is shaded; pressing it calls `onClose` (a landscape window with
 *   too little room beside the content for a docked one).
 * Stays mounted only while open or animating out.
 */
export function SlidePanel(props: { open: boolean; mode: "dock" | "overlay" | "float"; width?: number; onClose?: () => void; children: ReactNode }) {
  const { colors } = useTheme();
  const w = props.width ?? 340;
  const progress = useRef(new Animated.Value(props.open ? 1 : 0)).current;
  const [mounted, setMounted] = useState(props.open);
  const [full, setFull] = useState(0);

  useEffect(() => {
    if (props.open) setMounted(true);
    Animated.timing(progress, { toValue: props.open ? 1 : 0, duration: 260, easing: BEZIER, useNativeDriver: false }).start(({ finished }) => {
      if (finished && !props.open) setMounted(false);
    });
  }, [props.open, progress]);

  if (!mounted) return null;

  if (props.mode === "float") {
    return (
      <Animated.View
        pointerEvents={props.open ? "auto" : "none"}
        // Above everything the chat draws, as the overlay is.
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
            right: 0,
            width: w,
            maxWidth: "100%",
            overflow: "hidden",
            backgroundColor: colors.bgSecondary,
            transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [w, 0] }) }],
            ...({ boxShadow: "-6px 0 24px rgba(0,0,0,0.35)" } as object),
          }}
        >
          {props.children}
        </Animated.View>
      </Animated.View>
    );
  }

  if (props.mode === "dock") {
    return (
      <Animated.View
        style={{
          width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, w] }),
          overflow: "hidden",
          borderLeftWidth: 1,
          borderLeftColor: colors.separator,
          backgroundColor: colors.bgSecondary,
        }}
      >
        <View style={{ width: w, flex: 1 }}>{props.children}</View>
      </Animated.View>
    );
  }
  return (
    <Animated.View
      pointerEvents={props.open ? "auto" : "none"}
      onLayout={(e) => setFull(e.nativeEvent.layout.width)}
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        // Above everything the chat draws (its composer has a zIndex of its own, and when the chat's wrapper view is
        // flattened that composer is a sibling of this panel and would show through).
        zIndex: 100,
        elevation: 100,
        backgroundColor: colors.bgSecondary,
        transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [full || 400, 0] }) }],
      }}
    >
      {props.children}
    </Animated.View>
  );
}
