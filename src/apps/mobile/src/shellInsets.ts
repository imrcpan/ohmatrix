/** Window px on each side. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** How tall a status bar needs to be for its icons (dp). Anything above this is empty space the system keeps below them. */
const ICON_BAND = 32;
/** How much of that empty space the app takes back for its own content. */
const TAKE_BACK = 0.6;

/**
 * The room to leave at the top. Phones with a camera hole have a status bar well taller than its icons (45 dp, icons in
 * the upper 30), and leaving all of it makes the top of every screen look empty, so part of the empty band is given
 * back; a status bar no taller than its icons is left whole.
 */
export function topInset(statusBar: number): number {
  return statusBar > ICON_BAND ? statusBar - (statusBar - ICON_BAND) * TAKE_BACK : statusBar;
}

/**
 * The room the app leaves for what the system draws over it: the status bar and the navigation bar, and the keyboard.
 *
 * The app is drawn edge to edge, under the bars. On Android the keyboard's height is reported without the navigation
 * bar it sits over, so the bar is added back: from the bottom of the window to the top of the keyboard is both. On iOS the
 * keyboard's height already reaches the bottom of the screen, home indicator included.
 */
export function shellInsets(system: Insets, keyboardHeight: number, platform: "android" | "ios"): Insets {
  const keyboard = Math.max(0, keyboardHeight);
  const bottom = platform === "android" ? system.bottom + keyboard : keyboard > 0 ? keyboard : system.bottom;
  return { ...system, top: topInset(system.top), bottom };
}
