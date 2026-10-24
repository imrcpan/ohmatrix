import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  Animated,
  Easing,
  type FlatList,
  PanResponder,
  Platform,
  View,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { Icon, useTheme } from "@ohmatrix/ui";
import { pullTracker, type Touch } from "./pullTracker.js";

/** How far the list has to be pulled (after the drag's resistance) to refresh, and where it rests while it does. */
const TRIGGER = 64;
const HOLD = 52;
const MAX = 120;
const START = 0.55;
const FLOOR = 0.07;
const REACH = 200;

/** The list's offset for a finger travel: it follows at about half the speed at first, and the speed falls off to a small floor (never zero). */
export function damped(travel: number): number {
  const d = Math.max(0, travel);
  return FLOOR * d + (START - FLOOR) * REACH * Math.tanh(d / REACH);
}

/**
 * Pull the whole list down from its top to refresh it: the list follows the finger (with some resistance) and shows a mark in the room it
 * leaves above; let go past the trigger and it rests there, spinning, until `onRefresh` is done, then slides back. The list is given the scroll
 * handler it must report to, so that a pull only starts at its very top. At the top the list's own scrolling is off (a native scroll view
 * takes the touch from JS the moment it moves): the first upward drag there scrolls it by hand, and from then on it is native again.
 */
export function PullToRefresh<T>(props: {
  enabled: boolean;
  onRefresh: () => Promise<void>;
  children: (scroll: {
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
    scrollEventThrottle: number;
    scrollEnabled: boolean;
    listRef: RefObject<FlatList<T> | null>;
  }) => ReactNode;
}) {
  const { colors } = useTheme();
  const y = useRef(new Animated.Value(0)).current;
  const top = useRef(true);
  const [atTop, setAtTop] = useState(true);
  const listRef = useRef<FlatList<T> | null>(null);
  const busy = useRef(false);
  const [spinning, setSpinning] = useState(false);
  const turn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!spinning) return;
    turn.setValue(0);
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spinning, turn]);
  const tracker = useRef(pullTracker()).current;
  const live = useRef(props);
  live.current = props;

  const settle = (to: number, done?: () => void) => Animated.timing(y, { toValue: to, duration: 220, useNativeDriver: true }).start(done);

  const dragging = useRef(false);
  const drag = (travel: number) => {
    if (travel < 0) listRef.current?.scrollToOffset({ offset: -travel, animated: false });
    y.setValue(damped(travel));
  };
  const follow = (e: GestureResponderEvent) => {
    if (Platform.OS === "web" || !dragging.current) return;
    const touches = e.nativeEvent.touches as unknown as Touch[];
    if (touches.length === 0) return;
    drag(tracker.move(touches));
  };
  const lift = (e: GestureResponderEvent) => {
    if (Platform.OS === "web" || !dragging.current || e.nativeEvent.touches.length > 0) return;
    finish();
  };
  const finish = () => {
    if (!dragging.current) return;
    dragging.current = false;
    // `_value` is the animated value's current number: there is no public read of it.
    const pulled = (y as unknown as { _value: number })._value;
    if (pulled < TRIGGER) return settle(0);
    busy.current = true;
    setSpinning(true);
    settle(HOLD);
    void live.current.onRefresh().finally(() => {
      settle(0, () => {
        busy.current = false;
        setSpinning(false);
      });
    });
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) =>
          dragging.current ||
          (live.current.enabled &&
            !busy.current &&
            top.current &&
            (Platform.OS === "web" ? g.dy > 8 : Math.abs(g.dy) > 8) &&
            Math.abs(g.dy) > 2 * Math.abs(g.dx)),
        onPanResponderTerminationRequest: () => false,
        // The responder is let go as soon as any one finger lifts, so it only starts the pull; the raw touch events below carry it on.
        onPanResponderGrant: (e, g) => {
          // Granted again to the next finger of a relay: the pull goes on from where it is.
          if (dragging.current) return;
          dragging.current = true;
          tracker.begin(e.nativeEvent.touches as unknown as Touch[], g.dy);
        },
        // On the web there is one pointer (mouse or a single touch) and the responder's own gesture is exact.
        onPanResponderMove: (_, g) => {
          if (Platform.OS === "web" && dragging.current) drag(g.dy);
        },
        onPanResponderRelease: () => {
          if (Platform.OS === "web") finish();
        },
        onPanResponderTerminate: () => {
          if (Platform.OS === "web") finish();
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const t = e.nativeEvent.contentOffset.y <= 0;
    top.current = t;
    setAtTop((was) => (was === t ? was : t));
  };

  return (
    <View style={{ flex: 1, overflow: "hidden" }} {...pan.panHandlers} onTouchMove={follow} onTouchEnd={lift} onTouchCancel={lift}>
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, alignItems: "center" }}>
        <Animated.View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.hover,
            // Centred in the gap between the top and the list; the gap never counts as less than HOLD, so below that the list slides over it.
            transform: [
              {
                translateY: y.interpolate({
                  inputRange: [0, HOLD, MAX],
                  outputRange: [HOLD / 2 - 20, HOLD / 2 - 20, MAX / 2 - 20],
                  extrapolateLeft: "clamp",
                  extrapolateRight: "extend",
                }),
              },
            ],
          }}
        >
          {spinning ? (
            <Animated.View style={{ transform: [{ rotate: turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}>
              <Icon name="spinner" size={21} strokeWidth={2.6} color={colors.accent} />
            </Animated.View>
          ) : (
            <Animated.View
              style={{ transform: [{ rotate: y.interpolate({ inputRange: [TRIGGER - 10, TRIGGER], outputRange: ["180deg", "0deg"], extrapolate: "clamp" }) }] }}
            >
              <Icon name="send" size={21} strokeWidth={2.6} color={colors.accent} />
            </Animated.View>
          )}
        </Animated.View>
      </View>
      <Animated.View style={{ flex: 1, backgroundColor: colors.bg, transform: [{ translateY: y }] }}>
        {props.children({ onScroll, scrollEventThrottle: 16, scrollEnabled: !(Platform.OS !== "web" && props.enabled && atTop && !spinning), listRef })}
      </Animated.View>
    </View>
  );
}
