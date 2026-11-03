export const SIDEBAR_MIN = 260;
export const SIDEBAR_MAX = 520;
/**
 * The narrow strip with only the pictures: the width of a chat row's picture (44) with the room on each side of it that the rows
 * of the full list have (6 outside the row, 8 inside), so a picture stands in the strip as it stands in the list.
 */
export const SIDEBAR_RAIL = 72;
/** Dragged narrower than this the list is the strip; wider, it is a list (at least `SIDEBAR_MIN`). Nothing in between: the width jumps. */
export const SIDEBAR_SNAP = Math.round((SIDEBAR_RAIL + SIDEBAR_MIN) / 2);

/** Keeps the chat list usable and leaves at least half the window for the conversation. Below the snap width it is the strip. */
export function clampSidebar(width: number, windowWidth: number): number {
  if (width < SIDEBAR_SNAP) return SIDEBAR_RAIL;
  const max = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.floor(windowWidth / 2)));
  return Math.round(Math.min(max, Math.max(SIDEBAR_MIN, width)));
}

/** Default width when the user has not dragged the divider: 30% of the window. */
export function autoSidebar(windowWidth: number): number {
  return clampSidebar(Math.round(windowWidth * 0.3), windowWidth);
}

/** Width of the panel that floats over the window when the list is only a strip: roomier than the list, which has the chats to share the window with. */
export function floatingSidebar(windowWidth: number): number {
  return Math.min(560, Math.max(380, Math.round(windowWidth * 0.4)));
}

/** Width of the chat info beside the chat (docked), and of the same panel when it floats over the chat. */
export const INFO_DOCK = 340;
export const INFO_FLOAT = 400;
/** The least the chat may be left with beside the docked info: a fifth wider than the info itself. */
export const CHAT_MIN = Math.round(INFO_DOCK * 1.2);

/** Whether the chat info floats over the chat, rather than pushing it aside: the chat would be left too narrow beside it. */
export function infoFloats(windowWidth: number, sidebar: number): boolean {
  return windowWidth - sidebar - 1 - INFO_DOCK < CHAT_MIN;
}

/** Whether a width is the strip with only the pictures. */
export const isRail = (width: number) => width <= SIDEBAR_RAIL;
