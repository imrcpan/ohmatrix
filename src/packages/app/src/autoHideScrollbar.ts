import { Platform } from "react-native";

/**
 * A list whose scrollbar is not always there, as on a phone: the system's own is a strip of 8 to 17px that stays (and takes room from what it
 * scrolls, 72px wide in the strip of pictures), so on the web the list has none (apps/*\/index.html sets its width to 0), and while it scrolls a thin
 * indicator is drawn over its right edge, which fades out when it stops. Spread `autoHideScrollbar()` into the list's props; it is nothing on a phone.
 */
const SHOWN_MS = 900;
const MARK = "data-autohide-scrollbar";
let installed = false;

/** The few parts of the DOM this file touches (the app's TypeScript has no DOM library). */
interface Scroller {
  hasAttribute(name: string): boolean;
  scrollHeight: number;
  clientHeight: number;
  scrollTop: number;
  getBoundingClientRect(): { top: number; right: number };
}
interface Bar {
  style: { cssText: string; height: string; top: string; left: string; opacity: string };
}
interface Page {
  createElement(tag: string): Bar & object;
  body: { appendChild(el: object): void };
  addEventListener(type: "scroll", fn: (e: { target: unknown }) => void, opts: { capture: boolean; passive: boolean }): void;
}

function install() {
  const page = (globalThis as { document?: Page }).document;
  if (installed || !page) return;
  installed = true;
  // One indicator for all such lists: it is moved to whichever scrolls. It does not take the pointer.
  const bar = page.createElement("div");
  bar.style.cssText =
    "position:fixed;width:6px;border-radius:3px;background:rgba(128,128,128,0.55);pointer-events:none;opacity:0;transition:opacity .25s;z-index:30;";
  page.body.appendChild(bar);
  let timer: ReturnType<typeof setTimeout> | undefined;
  page.addEventListener(
    "scroll",
    (e) => {
      const el = e.target as Scroller | null;
      if (!el || typeof el.hasAttribute !== "function" || !el.hasAttribute(MARK)) return;
      const room = el.scrollHeight - el.clientHeight;
      if (room <= 0) return;
      const box = el.getBoundingClientRect();
      const height = Math.max(28, (el.clientHeight * el.clientHeight) / el.scrollHeight);
      const top = box.top + (el.scrollTop / room) * (el.clientHeight - height);
      bar.style.height = `${height}px`;
      bar.style.top = `${top}px`;
      bar.style.left = `${box.right - 9}px`;
      bar.style.opacity = "1";
      clearTimeout(timer);
      timer = setTimeout(() => (bar.style.opacity = "0"), SHOWN_MS);
    },
    { capture: true, passive: true },
  );
}

export function autoHideScrollbar(): object {
  if (Platform.OS !== "web") return {};
  install();
  return { dataSet: { autohideScrollbar: "1" } };
}
