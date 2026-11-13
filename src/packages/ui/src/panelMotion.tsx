import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, type ViewStyle } from "react-native";
import {
  FADE_IN,
  HOVER,
  PANEL_CLOSING,
  PANEL_FROM,
  PANEL_OPENING,
  PIECE_CLOSING,
  PIECE_FROM,
  PIECE_OPENING,
  REDUCED_MS,
  pieceDelay,
  ringDistance,
  type Curve,
  type DialogStep,
} from "./emojiPanelTimeline.js";

const native = Platform.OS !== "web";

const curve = (c: Curve) => (typeof c === "function" ? c : Easing.bezier(...c));

/** One value going to `to` the way `step` says, after `delay`; with `reduced` (reduce motion) in .01s and at once. */
function go(value: Animated.Value, to: number, step: DialogStep, reduced: boolean, delay = 0): Animated.CompositeAnimation {
  return Animated.timing(value, {
    toValue: to,
    duration: reduced ? REDUCED_MS : step.duration,
    delay: reduced ? 0 : delay,
    easing: curve(step.easing),
    useNativeDriver: native,
  });
}

/** Whether the person asked the system for less motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (v) => live && setReduced(v),
      () => {},
    );
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);
  return reduced;
}

/** What the pieces of a panel are told: whether it is open, which opening this is, whether it has begun to open, and the reduce-motion setting. */
interface PopState {
  visible: boolean;
  epoch: number;
  begun: boolean;
  reduced: boolean;
}
/** Outside a panel with a motion the pieces are just there (and still grow under the pointer). */
const PopContext = createContext<PopState>({ visible: true, epoch: 0, begun: true, reduced: false });
export const PopProvider = PopContext.Provider;

/**
 * How a panel of pieces (emoji, stickers) opens and closes: it grows from a point with a bounce (`PANEL_OPENING`: from a quarter of
 * its size, a good deal past full size, and back), and closes quicker. `ready` is whether the point it grows from is known: it
 * waits for that, unseen. `pop` is what goes to the pieces (`PopProvider`), which come up in rings. `mounted` is what the modal's
 * `visible` is: it stays up while the panel closes. The numbers are those of the animation lab's page, in `emojiPanelTimeline.ts`.
 */
export function usePanelMotion(open: boolean, ready = true) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(open);
  const [epoch, setEpoch] = useState(0);
  // Whether this opening has begun. It is false from the moment the panel is closed, so that the pieces that are made when it is
  // opened again are made at where they start from, not in their places (they are only "late" once the opening has begun).
  const [started, setStarted] = useState(false);
  const [v] = useState(() => ({ opacity: new Animated.Value(0), scale: new Animated.Value(PANEL_FROM) }));
  const playing = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);
  useEffect(() => {
    if (!mounted) return;
    playing.current?.stop();
    if (open) {
      if (!ready) return;
      setStarted(true);
      setEpoch((e) => e + 1);
      playing.current = Animated.parallel([go(v.opacity, 1, PANEL_OPENING.opacity, reduced), go(v.scale, 1, PANEL_OPENING.scale, reduced)]);
      playing.current.start();
    } else {
      setStarted(false);
      playing.current = Animated.parallel([go(v.opacity, 0, PANEL_CLOSING.opacity, reduced), go(v.scale, PANEL_FROM, PANEL_CLOSING.scale, reduced)]);
      // Only a closing that ran to its end takes the panel away; one that was turned round by an opening leaves it up.
      playing.current.start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reduced` is read when it starts; a change of it must not start it again
  }, [open, mounted, ready, v]);
  useEffect(() => () => playing.current?.stop(), []);
  const pop = useMemo<PopState>(() => ({ visible: open, epoch, begun: started, reduced }), [open, epoch, started, reduced]);
  return { mounted, panel: { opacity: v.opacity, transform: [{ scale: v.scale }] }, pop };
}

export interface Hover {
  onHoverIn(): void;
  onHoverOut(): void;
}

/**
 * One piece of a panel (an emoji, a sticker), in a grid of `cols` columns of which `rows` rows are seen. It comes up when the panel
 * does, after a wait that grows with its distance from the middle of what is seen, from no size and turned back, with a bounce; and
 * it is bigger and turned the other way while the pointer is on it. `children` gets the two functions that tell it where the pointer
 * is (to put on the pressable). A piece out of sight, or one that is made after the panel has opened (another group, a search), is
 * simply there.
 */
export function PopPiece(props: { index: number; cols: number; rows: number; children: (hover: Hover) => ReactNode }) {
  const ctx = useContext(PopContext);
  const seen = Math.floor(props.index / props.cols) < props.rows;
  const delay = pieceDelay(ringDistance(props.index, props.cols, props.rows));
  const [m] = useState(() => {
    const there = ctx.begun || !seen;
    const opacity = new Animated.Value(there ? 1 : PIECE_FROM.opacity);
    const size = new Animated.Value(there ? 1 : PIECE_FROM.scale);
    const turn = new Animated.Value(there ? 0 : PIECE_FROM.rotate);
    const hover = new Animated.Value(0);
    const scale = Animated.multiply(size, hover.interpolate({ inputRange: [0, 1], outputRange: [1, HOVER.scale] }));
    const rotate = Animated.add(turn, Animated.multiply(hover, HOVER.rotate)).interpolate({ inputRange: [-360, 360], outputRange: ["-360deg", "360deg"] });
    return { opacity, size, turn, hover, style: { opacity, transform: [{ scale }, { rotate }] } };
  });
  const born = useRef(ctx.epoch);
  const playing = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    if (!seen) return;
    playing.current?.stop();
    if (ctx.visible) {
      if (ctx.epoch === born.current) return;
      born.current = ctx.epoch;
      playing.current = Animated.parallel([
        go(m.opacity, 1, PIECE_OPENING.opacity, ctx.reduced, delay),
        go(m.size, 1, PIECE_OPENING.pop, ctx.reduced, delay),
        go(m.turn, 0, PIECE_OPENING.pop, ctx.reduced, delay),
      ]);
    } else {
      playing.current = Animated.parallel([
        go(m.opacity, PIECE_FROM.opacity, PIECE_CLOSING.opacity, ctx.reduced),
        go(m.size, PIECE_FROM.scale, PIECE_CLOSING.pop, ctx.reduced),
        go(m.turn, PIECE_FROM.rotate, PIECE_CLOSING.pop, ctx.reduced),
      ]);
    }
    playing.current.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- it plays when the panel opens or closes, not when the grid moves under it
  }, [ctx.epoch, ctx.visible]);
  useEffect(() => () => playing.current?.stop(), []);
  const hover = useMemo<Hover>(
    () => ({
      onHoverIn: () => {
        if (ctx.visible) go(m.hover, 1, HOVER.in, ctx.reduced).start();
      },
      onHoverOut: () => go(m.hover, 0, HOVER.out, ctx.reduced, delay).start(),
    }),
    [ctx.visible, ctx.reduced, delay, m],
  );
  return <Animated.View style={m.style}>{props.children(hover)}</Animated.View>;
}

/**
 * Something that comes with the panel and has no motion but to fade in, a little after the panel (`FADE_IN`): the name of the group. Like
 * a piece, it is simply there when it is made after the panel has opened.
 */
export function PopFade(props: { style?: ViewStyle; children: ReactNode }) {
  const ctx = useContext(PopContext);
  const [opacity] = useState(() => new Animated.Value(ctx.begun ? 1 : 0));
  const born = useRef(ctx.epoch);
  const playing = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    if (!ctx.visible || ctx.epoch === born.current) return;
    born.current = ctx.epoch;
    playing.current?.stop();
    playing.current = go(opacity, 1, FADE_IN.step, ctx.reduced, FADE_IN.delay);
    playing.current.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- it plays when the panel opens, not when the text changes
  }, [ctx.epoch, ctx.visible]);
  useEffect(() => () => playing.current?.stop(), []);
  return <Animated.View style={[props.style, { opacity }]}>{props.children}</Animated.View>;
}
