import { useEffect, type ReactNode } from "react";
import { ScaleContext } from "./viewport.js";

/**
 * Zooms the whole page (including modal portals, which live outside the app root).
 * Browsers keep the window size in physical px, so `useViewport` divides it by the zoom.
 */
const root = () => (globalThis as unknown as { document: { documentElement: { style: { zoom: string } } } }).document.documentElement;

/** Page zoom already covers modal portals. */
export function ScaleRoot(props: { scale: number; children: ReactNode }) {
  return <>{props.children}</>;
}

export function ScaleProvider(props: { scale: number; children: ReactNode }) {
  useEffect(() => {
    root().style.zoom = props.scale === 1 ? "" : String(props.scale);
    return () => {
      root().style.zoom = "";
    };
  }, [props.scale]);
  return <ScaleContext.Provider value={props.scale}>{props.children}</ScaleContext.Provider>;
}
