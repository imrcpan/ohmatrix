import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform } from "react-native";

const IN_MS = 90;
const OUT_MS = 70;

/**
 * The fade of a panel that opens over the page (the emoji picker). The menus have a motion of their own (`useMenuMotion`).
 * A `Modal`'s own fade is the system's (about 300 ms), which makes a panel feel slow to open; this one is short.
 * `mounted` is what the modal's `visible` is (it stays up while the fade-out runs), `opacity` goes on a view inside it.
 * With `enabled` false there is no fade at all.
 */
export function useQuickFade(visible: boolean, enabled = true): { mounted: boolean; opacity: Animated.Value } {
  const [mounted, setMounted] = useState(visible);
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const native = Platform.OS !== "web";
  useEffect(() => {
    if (!enabled) {
      opacity.setValue(visible ? 1 : 0);
      setMounted(visible);
      return;
    }
    if (visible) {
      setMounted(true);
      Animated.timing(opacity, { toValue: 1, duration: IN_MS, easing: Easing.out(Easing.quad), useNativeDriver: native }).start();
    } else {
      Animated.timing(opacity, { toValue: 0, duration: OUT_MS, easing: Easing.in(Easing.quad), useNativeDriver: native }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, enabled, opacity, native]);
  return { mounted: enabled ? mounted : visible, opacity };
}
