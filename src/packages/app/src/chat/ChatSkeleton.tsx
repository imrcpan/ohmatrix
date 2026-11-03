import { useMemo } from "react";
import { PixelRatio, View } from "react-native";
import { Pulse, SkeletonBlock, useTheme } from "@ohmatrix/ui";
import { gapAbove } from "./rowWindow.js";

/** Every skeleton bubble is as tall as the next, and a little different in length; all of them are the other people's: mine are never drawn as a skeleton. */
const BUBBLE = { height: 72, width: 41 } as const; // the width is a percent of the row, and varies a little (see `SPREAD`)
/** How far, in percent of the row, the width of a skeleton bubble strays from `BUBBLE.width`: from 35% to 47%. */
const SPREAD = 6;
const AVATAR = 32;
// The space between two messages that are not stuck together (each has its own round corners): the one the chat itself uses.
const GAP = PixelRatio.roundToNearestPixel(gapAbove(true));

/** How tall `count` skeleton bubbles are, for a list that has to allow for them. */
export function skeletonHeight(count: number): number {
  return 8 + count * (BUBBLE.height + GAP);
}

/**
 * Grey bubbles where messages are still to come, pulsing together like the rows of the chat list. In a group each
 * has a round grey avatar beside it, as a real message there does; in a one-to-one chat none has.
 */
export function ChatSkeleton(props: { count: number; avatars: boolean }) {
  const { colors } = useTheme();
  // Drawn once for as long as the skeleton stays: it must not change length at each pulse.
  const widths = useMemo(() => Array.from({ length: props.count }, () => BUBBLE.width + (Math.random() * 2 - 1) * SPREAD), [props.count]);
  return (
    <Pulse>
      <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 8, gap: GAP, flexDirection: "column-reverse" }}>
        {Array.from({ length: props.count }, (_, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
            {props.avatars && <SkeletonBlock width={AVATAR} height={AVATAR} circle />}
            <View style={{ height: BUBBLE.height, width: `${widths[i] ?? BUBBLE.width}%`, borderRadius: 18, backgroundColor: colors.hover }} />
          </View>
        ))}
      </View>
    </Pulse>
  );
}
