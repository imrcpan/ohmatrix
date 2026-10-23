import { createContext, useContext, useEffect } from "react";
import { useWindowDimensions } from "react-native";

export const ScaleContext = createContext(1);

/** Window size in layout px, i.e. after the interface zoom. */
export function useViewport(): { width: number; height: number } {
  const win = useWindowDimensions();
  const scale = useContext(ScaleContext);
  return { width: win.width / scale, height: win.height / scale };
}

/** Converts window coordinates (as measured by the browser, i.e. zoomed) to layout px. */
export function useUnzoom(): (v: number) => number {
  const scale = useContext(ScaleContext);
  return (v) => v / scale;
}

/** Wraps a Modal's content so it is scaled like the rest of the interface (see ScaleRoot). */
export function useScale(): number {
  return useContext(ScaleContext);
}

/** What the platform draws over the window (the status bar, the navigation bar), in layout px. Zero where there is none. */
export interface SystemInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
  /**
   * Of `bottom`, the part the app is drawn under instead of leaving it clear: a gesture bar (the thin pill) that floats over the
   * interface. The frame does not pad for it, so the screens reach the bottom edge, and what sits at the bottom (the input bar, the
   * end of a list) adds this itself, on its own background. Absent or 0 where the bottom is left clear (buttons, keyboard open).
   */
  navBottom?: number;
  /** From the bottom of the window to the top of the on-screen keyboard (0 when it is hidden). */
  keyboard?: number;
}

export const InsetsContext = createContext<SystemInsets>({ top: 0, right: 0, bottom: 0, left: 0 });

/** How much room what sits at the very bottom of a screen leaves for the floating gesture bar (see `SystemInsets.navBottom`). */
export function useNavBottom(): number {
  return useContext(InsetsContext).navBottom ?? 0;
}

/** The room a full-window layer (a Modal draws edge to edge) must leave clear of the system bars. */
export function useInsets(): SystemInsets {
  return useContext(InsetsContext);
}

/**
 * Lets a layer that has a text field of its own (a dialog) ask the shell not to lift the screens behind it for the keyboard: they
 * stay where they are, and the layer keeps itself clear of the keyboard instead (see `useInsets().keyboard`). Absent = no shell to ask.
 */
export const KeyboardHoldContext = createContext<{ acquire: () => () => void } | null>(null);

/** While `active`, the screens behind are not lifted by the keyboard. */
export function useKeyboardHold(active: boolean): void {
  const hold = useContext(KeyboardHoldContext);
  useEffect(() => (active && hold ? hold.acquire() : undefined), [active, hold]);
}
