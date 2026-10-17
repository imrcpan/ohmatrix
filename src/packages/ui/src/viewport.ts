import { createContext, useContext } from "react";
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
}

export const InsetsContext = createContext<SystemInsets>({ top: 0, right: 0, bottom: 0, left: 0 });

/** The room a full-window layer (a Modal draws edge to edge) must leave clear of the system bars. */
export function useInsets(): SystemInsets {
  return useContext(InsetsContext);
}
