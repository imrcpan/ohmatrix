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
