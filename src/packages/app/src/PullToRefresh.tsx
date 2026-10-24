import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Animated, Easing, PanResponder, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { Icon, useTheme } from "@ohmatrix/ui";

/** How far the list has to be pulled (after the drag's resistance) to refresh, and where it rests while it does. */
const TRIGGER = 64;
const HOLD = 52;
const MAX = 120;

export interface Scroller {
  scrollToOffset(o: { offset: number; animated: boolean }): void;
}

/**
 * Pull the whole list down from its top to refresh it: the list follows the finger (with some resistance) and shows a mark in the room it
 * leaves above; let go past the trigger and it rests there, spinning, until `onRefresh` is done, then slides back. The list is given the scroll
 * handler it must report to, so that a pull only starts at its very top. At the top the list's own scrolling is off (a native scroll view
 * takes the touch from JS the moment it moves): the first upward drag there scrolls it by hand, and from then on it is native again.
 */
export function PullToRefresh(props: {
  enabled: boolean;
  onRefresh: () => Promise<void>;
  children: (scroll: {
    onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
    scrollEventThrottle: number;
    scrollEnabled: boolean;
    listRef: RefObject<Scroller | null>;
  }) => ReactNode;
}) {
  const { colors } = useTheme();
  const y = useRef(new Animated.Value(0)).current;
  const top = useRef(true);
  const [atTop, setAtTop] = useState(true);
  const listRef = useRef<Scroller | null>(null);
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
  const live = useRef(props);
  live.current = props;

  const settle = (to: number, done?: () => void) => Animated.timing(y, { toValue: to, duration: 220, useNativeDriver: true }).start(done);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) =>
          live.current.enabled && !busy.current && top.current && Math.abs(g.dy) > 8 && Math.abs(g.dy) > 2 * Math.abs(g.dx),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => {
          if (g.dy < 0) listRef.current?.scrollToOffset({ offset: -g.dy, animated: false });
          y.setValue(Math.min(MAX, Math.max(0, g.dy) * 0.5));
        },
        onPanResponderRelease: () => {
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
        },
        onPanResponderTerminate: () => settle(0),
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
    <View style={{ flex: 1, overflow: "hidden" }}>
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
              { translateY: y.interpolate({ inputRange: [0, HOLD, MAX], outputRange: [HOLD / 2 - 20, HOLD / 2 - 20, MAX / 2 - 20], extrapolate: "clamp" }) },
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
      <Animated.View style={{ flex: 1, backgroundColor: colors.bg, transform: [{ translateY: y }] }} {...pan.panHandlers}>
        {props.children({ onScroll, scrollEventThrottle: 16, scrollEnabled: !(props.enabled && atTop && !spinning), listRef })}
      </Animated.View>
    </View>
  );
}
