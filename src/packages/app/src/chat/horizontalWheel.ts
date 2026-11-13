import { useEffect, type RefObject } from "react";
import { Platform } from "react-native";

/** What is used of a scroll view's element and of a wheel event (the DOM types are not in this package). */
interface ScrollNode {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
  addEventListener(type: "wheel", listener: (e: WheelNode) => void, options: { passive: boolean }): void;
  removeEventListener(type: "wheel", listener: (e: WheelNode) => void): void;
}
interface WheelNode {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  preventDefault(): void;
}

/**
 * Lets the wheel of a mouse (which turns up and down) move a row that scrolls sideways, as a browser does not: a turn of the wheel moves
 * the row by as much, until it is at its end, where the wheel goes on to the page. A wheel that already turns sideways (a trackpad, or
 * Shift held) is left to the browser. Only on the web: elsewhere a finger does it.
 */
export function useWheelToSide(ref: RefObject<{ getScrollableNode?: () => unknown } | null>): void {
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const node = ref.current?.getScrollableNode?.() as ScrollNode | undefined;
    if (!node?.addEventListener) return;
    const onWheel = (e: WheelNode) => {
      if (e.deltaX !== 0 || e.deltaY === 0) return;
      const max = node.scrollWidth - node.clientWidth;
      if (max <= 0) return;
      // A wheel counts in lines (Firefox) or pages as well as in pixels.
      const step = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? node.clientWidth : 1);
      const next = Math.max(0, Math.min(max, node.scrollLeft + step));
      if (next === node.scrollLeft) return;
      node.scrollLeft = next;
      e.preventDefault();
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [ref]);
}
