import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform } from "react-native";
import { CLOSING, FROM_SCALE, MAX_ANIMATED_ROWS, OPENING, ROW_OFFSET, rowDelay, type Step } from "./menuTimeline.js";

const native = Platform.OS !== "web";

/** One value going to `to` the way `step` says (`delay`: the wait before it starts). */
function go(value: Animated.Value, to: number, step: Step, delay = 0): Animated.CompositeAnimation {
  return Animated.timing(value, { toValue: to, duration: step.duration, easing: Easing.bezier(...step.easing), delay, useNativeDriver: native });
}

type PanelStyle = { opacity: Animated.Value; transform: [{ scale: Animated.Value }] };
type RowStyle = { opacity: Animated.Value; transform: [{ translateY: Animated.Value }] };
interface RowValues {
  opacity: Animated.Value;
  shift: Animated.Value;
  style: RowStyle;
}

export interface MenuMotion {
  /** What the modal's `visible` is: it stays up while the menu closes. */
  mounted: boolean;
  /** The style of the view that is the whole menu (put `transformOrigin` next to it, where the menu grows from). Undefined with no motion. */
  panel: PanelStyle | undefined;
  /** The style of the view round row `i` (the rows come in one after the other). Undefined with no motion. */
  row(i: number): RowStyle | undefined;
}

/**
 * How a menu opens and closes, the same for every menu: it grows from the point it was asked for (scale from half its size, and
 * opacity) with a bounce, and the rows come down into place one after the other; closing is shorter, and the rows go first. The
 * numbers are those of the animation lab's "bounce" menu, in `menuTimeline.ts`.
 *
 * `rows` is how many rows the menu has (each is wrapped in a view with `row(i)`). With `enabled` false there is no motion at all.
 * A menu opened again while it is closing turns round from where it is, as a CSS transition does.
 */
export function useMenuMotion(visible: boolean, options: { rows: number; enabled?: boolean }): MenuMotion {
  const enabled = options.enabled !== false;
  const [mounted, setMounted] = useState(visible);
  const [panel] = useState(() => {
    const opacity = new Animated.Value(0);
    const scale = new Animated.Value(FROM_SCALE);
    return { opacity, scale, style: { opacity, transform: [{ scale }] } as PanelStyle };
  });
  const rows = useRef<RowValues[]>([]);
  const count = useRef(options.rows);
  // Whether the menu is open (or opening): a row that is made then (a list that grew) is made in place, not waiting for its turn.
  const open = useRef(false);
  const playing = useRef<Animated.CompositeAnimation | null>(null);

  const rowAt = (i: number): RowValues => {
    let r = rows.current[i];
    if (!r) {
      const opacity = new Animated.Value(open.current ? 1 : 0);
      const shift = new Animated.Value(open.current ? 0 : ROW_OFFSET);
      r = rows.current[i] = { opacity, shift, style: { opacity, transform: [{ translateY: shift }] } };
    }
    return r;
  };

  useEffect(() => {
    count.current = options.rows;
  });
  // Mounted first, and played in the effect after it: the motion starts once the rows are drawn. (Started in the same commit as the
  // first drawing of the menu, the first frames of it were lost to that work: the curve was no longer that of the page.)
  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);
  // It plays once the menu is on screen with everything at where it starts from (see "mounted"), so that nothing shows before it.
  useEffect(() => {
    if (!enabled || !mounted) return;
    const n = Math.min(count.current, MAX_ANIMATED_ROWS);
    playing.current?.stop();
    if (visible) {
      const all = [go(panel.opacity, 1, OPENING.opacity), go(panel.scale, 1, OPENING.scale)];
      for (let i = 0; i < n; i++) {
        const r = rowAt(i);
        all.push(go(r.opacity, 1, OPENING.rowOpacity, rowDelay(i)), go(r.shift, 0, OPENING.rowShift, rowDelay(i)));
      }
      open.current = true;
      playing.current = Animated.parallel(all);
      playing.current.start();
    } else {
      open.current = false;
      const all = [go(panel.opacity, 0, CLOSING.opacity), go(panel.scale, FROM_SCALE, CLOSING.scale)];
      for (let i = 0; i < n; i++) {
        const r = rowAt(i);
        all.push(go(r.opacity, 0, CLOSING.row), go(r.shift, ROW_OFFSET, CLOSING.row));
      }
      playing.current = Animated.parallel(all);
      // Only a closing that ran to its end takes the menu away; one that was turned round by an opening leaves it up.
      playing.current.start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `panel` and the rows are made once and never replaced
  }, [visible, mounted, enabled]);
  useEffect(() => () => playing.current?.stop(), []);

  return {
    mounted: enabled ? mounted : visible,
    panel: enabled ? panel.style : undefined,
    row: (i) => (enabled && i < MAX_ANIMATED_ROWS ? rowAt(i).style : undefined),
  };
}
