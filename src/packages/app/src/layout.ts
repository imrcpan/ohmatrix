export const SIDEBAR_MIN = 260;
export const SIDEBAR_MAX = 520;

/** Keeps the chat list usable and leaves at least half the window for the conversation. */
export function clampSidebar(width: number, windowWidth: number): number {
  const max = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.floor(windowWidth / 2)));
  return Math.round(Math.min(max, Math.max(SIDEBAR_MIN, width)));
}

/** Default width when the user has not dragged the divider: 30% of the window. */
export function autoSidebar(windowWidth: number): number {
  return clampSidebar(Math.round(windowWidth * 0.3), windowWidth);
}
