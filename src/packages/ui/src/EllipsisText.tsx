import { useMemo, useState } from "react";
import { truncateWithDots } from "./truncate.js";
import { Platform, StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";

let canvas: { getContext(id: "2d"): { font: string; measureText(s: string): { width: number } } | null } | null | undefined;
function webMeasurer(style: TextStyle) {
  if (canvas === undefined) canvas = (globalThis as { document?: { createElement(t: "canvas"): typeof canvas } }).document?.createElement("canvas") ?? null;
  const ctx = canvas?.getContext("2d");
  if (!ctx) return null;
  ctx.font = `${style.fontWeight ?? "400"} ${style.fontSize ?? 16}px ${style.fontFamily ?? "sans-serif"}`;
  return (s: string) => ctx.measureText(s).width;
}

/**
 * Single-line text that truncates with three ASCII dots ("...") instead of the platform's "…".
 * On web the cut is computed exactly by measuring the text; native falls back to the platform
 * ellipsis until a native measurer is added (see TODO.md).
 */
export function EllipsisText(props: { children: string; style?: StyleProp<TextStyle>; selectable?: boolean }) {
  const [width, setWidth] = useState(0);
  const flat = StyleSheet.flatten(props.style) ?? {};
  const text = props.children;
  const shown = useMemo(() => {
    if (Platform.OS !== "web" || !width) return text;
    const measure = webMeasurer(flat);
    return measure ? truncateWithDots(text, width, measure) : text;
  }, [text, width, flat.fontSize, flat.fontFamily, flat.fontWeight]);

  return (
    <Text
      numberOfLines={1}
      ellipsizeMode={Platform.OS === "web" ? "clip" : "tail"}
      style={props.style}
      onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))}
    >
      {shown}
    </Text>
  );
}
