import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Platform, View } from "react-native";
import { useTheme } from "@ohmatrix/ui";

/** iOS-style push transition: detail slides over the list, which parallax-shifts left. */
export function SlideStack(props: { list: ReactNode; detail: ReactNode | null }) {
  const { colors } = useTheme();
  const open = props.detail !== null;
  const progress = useRef(new Animated.Value(open ? 1 : 0)).current;
  const [width, setWidth] = useState(0);
  const lastDetail = useRef<ReactNode>(null);
  if (props.detail !== null) lastDetail.current = props.detail;
  const [settledClosed, setSettledClosed] = useState(!open);

  useEffect(() => {
    if (open) setSettledClosed(false);
    Animated.timing(progress, { toValue: open ? 1 : 0, duration: 300, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: Platform.OS !== "web" }).start(
      ({ finished }) => {
        if (finished && !open) {
          setSettledClosed(true);
          lastDetail.current = null;
        }
      },
    );
  }, [open, progress]);

  return (
    <View style={{ flex: 1, overflow: "hidden", backgroundColor: colors.bg }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <Animated.View style={{ flex: 1, transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -width * 0.28] }) }] }}>
        {props.list}
      </Animated.View>
      {!settledClosed && (
        <Animated.View
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: colors.bg,
            transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [width, 0] }) }],
          }}
        >
          {lastDetail.current}
        </Animated.View>
      )}
    </View>
  );
}
