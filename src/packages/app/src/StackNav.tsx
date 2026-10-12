import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Platform, View } from "react-native";
import { useTheme } from "@ohmatrix/ui";

const BEZIER = Easing.bezier(0.22, 1, 0.36, 1);

export interface StackPage {
  node: ReactNode;
  /** Edge the page slides in from when it opens (default: right, like a push). */
  from?: "left" | "right";
}

/**
 * Stack of pages: the page at `depth` is on top. Pages open from the right (push) or from the left
 * (drawer-style); the page underneath parallax-shifts away from a right-hand push and stays put under
 * a left-hand one. Pages above `depth` stay mounted only while sliding out.
 */
export function StackNav(props: { pages: StackPage[]; depth: number }) {
  const { colors } = useTheme();
  const progress = useRef(new Animated.Value(props.depth)).current;
  const [width, setWidth] = useState(0);
  const [rendered, setRendered] = useState(props.depth);

  useEffect(() => {
    if (props.depth > rendered) setRendered(props.depth);
    Animated.timing(progress, { toValue: props.depth, duration: 280, easing: BEZIER, useNativeDriver: Platform.OS !== "web" }).start(({ finished }) => {
      if (finished) setRendered(props.depth);
    });
  }, [props.depth, progress]);

  return (
    <View style={{ flex: 1, overflow: "hidden", backgroundColor: colors.bg }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {props.pages.slice(0, rendered + 1).map((page, i) => {
        const enter = page.from === "left" ? -width : width;
        const under = props.pages[i + 1]?.from === "left" ? 0 : -width * 0.28;
        return (
          <Animated.View
            key={i}
            pointerEvents={i === props.depth ? "auto" : "none"}
            style={[
              i === 0 ? { flex: 1 } : { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: colors.bgSecondary },
              { transform: [{ translateX: progress.interpolate({ inputRange: [i - 1, i, i + 1], outputRange: [enter, 0, under], extrapolate: "clamp" }) }] },
            ]}
          >
            {page.node}
          </Animated.View>
        );
      })}
    </View>
  );
}
