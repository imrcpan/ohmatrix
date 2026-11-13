import { useTheme, popoverShadow, radius } from "./theme.js";

/** The height of a row of a menu, and the room above its first row, under its last, and at the sides of a row. */
export const MENU_ROW = 36;
export const MENU_PAD = 2;

/**
 * What every menu looks like, taken from the menu of a chat bubble (the other person's bubble: its surface and its text, the hover of
 * the theme, a soft shadow and no border). A menu has four round corners; the menu of a bubble gives one of them to the corner
 * at the pointer, which is tight like the tail of a bubble.
 */
export function useMenuLook() {
  const { colors, dark } = useTheme();
  const surface = colors.bubbleIn;
  return {
    dark,
    colors,
    surface,
    /** The colour of the text and of the icons. */
    fg: colors.bubbleInText,
    danger: colors.danger,
    hover: dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)",
    /** The panel the rows sit on (with 2px of room above the first row and under the last). The rows reach its edges, so it cuts them to its corners. */
    panel: { backgroundColor: surface, borderRadius: radius.bubble, overflow: "hidden" as const, ...popoverShadow(dark) },
  };
}

export type MenuLook = ReturnType<typeof useMenuLook>;

/** The fill of a row: the hover colour while it is pressed, hovered or (a list worked with the keyboard) the chosen one. */
export function rowFill(look: MenuLook, state: { pressed: boolean; hovered?: boolean | undefined; active?: boolean }): string {
  return state.pressed || state.hovered || state.active ? look.hover : "transparent";
}

/** The shape and fill of a row of a menu: a pill, with half circles at its ends, that keeps the same room from the edge of the panel at the sides as above the first row and under the last; filled (as `rowFill` says) while it is pressed or hovered. */
export function rowStyle(look: MenuLook, state: { pressed: boolean; hovered?: boolean | undefined; active?: boolean }) {
  return { marginHorizontal: MENU_PAD, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: rowFill(look, state) };
}
