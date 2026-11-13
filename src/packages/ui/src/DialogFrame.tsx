import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CLOSING, CLOSING_SIZE, FROM_SCALE, OPENING, type Curve, type DialogStep } from "./dialogTimeline.js";
import { ScaleRoot } from "./Scale.js";
import { useScale } from "./viewport.js";
import { useTheme } from "./theme.js";

const native = Platform.OS !== "web";

const curve = (c: Curve) => (typeof c === "function" ? c : Easing.bezier(...c));

/** One value going to `to` the way `step` says. */
function go(value: Animated.Value, to: number, step: DialogStep): Animated.CompositeAnimation {
  return Animated.timing(value, { toValue: to, duration: step.duration, easing: curve(step.easing), useNativeDriver: native });
}

/**
 * How a dialog opens and closes, the same for every dialog: the dim layer fades in, and the card grows from its centre with a bounce
 * (from .6 of its size, a little past full size, and back), fading in as it grows; closing is shorter, and the card is at .6 at once. The numbers are those of the
 * animation lab's page, in `dialogTimeline.ts`. `mounted` is what the modal's `visible` is: it stays up while the dialog closes.
 */
export function useDialogMotion(visible: boolean) {
  const [mounted, setMounted] = useState(visible);
  const [v] = useState(() => ({ backdrop: new Animated.Value(0), opacity: new Animated.Value(0), scale: new Animated.Value(FROM_SCALE) }));
  const playing = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);
  // It plays once the dialog is on screen with everything at where it starts from, so that nothing shows before it.
  useEffect(() => {
    if (!mounted) return;
    playing.current?.stop();
    if (visible) {
      // The size starts over from .6 each time, as the page's animation does (the opacity and the dim layer go on from where they are).
      v.scale.setValue(FROM_SCALE);
      playing.current = Animated.parallel([go(v.backdrop, 1, OPENING.backdrop), go(v.opacity, 1, OPENING.opacity), go(v.scale, 1, OPENING.scale)]);
      playing.current.start();
    } else {
      // The size is not animated on closing: the card is at `CLOSING_SIZE` at once, and fades out (see `CLOSING`).
      v.scale.setValue(CLOSING_SIZE);
      playing.current = Animated.parallel([go(v.backdrop, 0, CLOSING.backdrop), go(v.opacity, 0, CLOSING.opacity)]);
      // Only a closing that ran to its end takes the dialog away; one that was turned round by an opening leaves it up.
      playing.current.start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, mounted, v]);
  useEffect(() => () => playing.current?.stop(), []);
  return {
    mounted,
    backdrop: { opacity: v.backdrop },
    card: { opacity: v.opacity, transform: [{ scale: v.scale }] },
  };
}

/**
 * The window of a dialog: a dim layer over everything, and the card in its middle (`children`, which is the card itself), both with the
 * motion of `useDialogMotion`. Pressing the dim area calls `onClose`, unless `dismiss` is false (a dialog that needs an answer).
 * `wrap` is the style of the view round the card (its width); `bottom` is room to leave under it (the keyboard).
 */
export function DialogFrame(props: { visible: boolean; onClose: () => void; dismiss?: boolean; wrap?: ViewStyle; bottom?: number; children: ReactNode }) {
  const { colors } = useTheme();
  const scale = useScale();
  const motion = useDialogMotion(props.visible);
  return (
    <Modal transparent visible={motion.mounted} animationType="none" onRequestClose={props.onClose}>
      <ScaleRoot scale={scale}>
        <View style={{ flex: 1 }}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }, motion.backdrop]} />
          <Pressable
            onPress={props.dismiss === false ? undefined : props.onClose}
            style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, paddingBottom: 24 + (props.bottom ?? 0) }}
          >
            <Animated.View style={[props.wrap, motion.card]}>{props.children}</Animated.View>
          </Pressable>
        </View>
      </ScaleRoot>
    </Modal>
  );
}
