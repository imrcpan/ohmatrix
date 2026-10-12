import { useMemo, useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import { useTheme } from "@ohmatrix/ui";

/** On web, dragging across text starts a selection, which makes react-native-web cancel the gesture. */
const lockSelection = (on: boolean) => {
  const body = (globalThis as { document?: { body?: { style: { userSelect: string } } } }).document?.body;
  if (body) body.style.userSelect = on ? "none" : "";
};

/**
 * Draggable divider on the right edge of the sidebar. Reports live width while dragging and the
 * final width on release; a double-tap resets to automatic.
 */
export function SidebarResizer(props: {
  width: number;
  clamp: (w: number) => number;
  onLive: (w: number | null) => void;
  onCommit: (w: number | null) => void;
}) {
  const { colors } = useTheme();
  const [active, setActive] = useState(false);
  const [hover, setHover] = useState(false);
  const start = useRef(props.width);
  const lastTap = useRef(0);
  const latest = useRef(props);
  latest.current = props;

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          start.current = latest.current.width;
          setActive(true);
          lockSelection(true);
        },
        onPanResponderMove: (_, g) => latest.current.onLive(latest.current.clamp(start.current + g.dx)),
        onPanResponderRelease: (_, g) => {
          setActive(false);
          lockSelection(false);
          latest.current.onLive(null);
          if (Math.abs(g.dx) < 3) {
            // A tap without dragging: two quick taps (double-click) reset to the automatic width.
            const now = Date.now();
            if (now - lastTap.current < 400) latest.current.onCommit(null);
            lastTap.current = now;
            return;
          }
          latest.current.onCommit(latest.current.clamp(start.current + g.dx));
        },
        onPanResponderTerminate: () => {
          setActive(false);
          lockSelection(false);
          latest.current.onLive(null);
        },
      }),
    [],
  );

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel="Resize chat list"
      {...pan.panHandlers}
      {...({ onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false) } as object)}
      style={[{ position: "absolute", top: 0, bottom: 0, right: -4, width: 9, alignItems: "center", zIndex: 5 }, { cursor: "col-resize" } as object]}
    >
      <View style={{ width: 2, flex: 1, backgroundColor: active || hover ? colors.accent : "transparent", opacity: active ? 1 : 0.7 }} />
    </View>
  );
}
