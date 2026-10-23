import { useRef, useState } from "react";
import { Animated, Modal, Pressable, Text, View } from "react-native";
import { ScaleRoot } from "./Scale.js";
import { useScale } from "./viewport.js";
import { useUnzoom, useViewport } from "./viewport.js";
import { Icon, type IconName } from "./Icon.js";
import { fontFamily, popoverShadow, useTheme } from "./theme.js";
import { useQuickFade } from "./quickFade.js";

export interface MenuItem {
  label: string;
  icon?: IconName;
  danger?: boolean;
  /** Shows a check mark (single-choice menus). */ checked?: boolean;
  onPress: () => void;
}
/** Window coordinates of what the menu points at (a button rect, or a pointer position with 0 size). */
export interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_WIDTH = 220;
const ROW = 36;

/**
 * Popover menu anchored to a point or rectangle (Fluent flyout / macOS context menu): opens below the
 * anchor (or above it with `up`), flips above near the bottom edge, and is clamped inside the window.
 */
export function Menu(props: {
  visible: boolean;
  anchor: Anchor | null;
  items: MenuItem[];
  onClose: () => void;
  alignRight?: boolean;
  up?: boolean;
  width?: number;
  /** The menu fades in and out (the default). A menu that something else follows at once has none. */
  fade?: boolean;
}) {
  const { colors, dark } = useTheme();
  const win = useViewport();
  const scale = useScale();
  const un = useUnzoom();
  const fade = useQuickFade(props.visible, props.fade !== false);
  // Keep the last position while the fade-out runs (closing clears the anchor).
  const last = useRef<Anchor | null>(props.anchor);
  if (props.anchor) last.current = props.anchor;
  const raw = props.anchor ?? last.current ?? { x: 0, y: 0, width: 0, height: 0 };
  const a = { x: un(raw.x), y: un(raw.y), width: un(raw.width), height: un(raw.height) };
  // A row is as tall as its text needs (a long name goes on a second line, never cut off), so the menu's height is what it measured to be;
  // until it has been measured, the height of rows of one line.
  const [measured, setMeasured] = useState(0);
  const h = measured || props.items.length * ROW + 4;
  // The menu is the same component for every use, so what was measured for one list is not kept for the next.
  const lastItems = useRef(props.items);
  if (lastItems.current !== props.items && lastItems.current.length !== props.items.length) {
    lastItems.current = props.items;
    if (measured) setMeasured(0);
  }
  const MENU_WIDTH = props.width ?? DEFAULT_WIDTH;
  const rawLeft = props.alignRight ? a.x + a.width - MENU_WIDTH : a.x;
  const left = Math.max(8, Math.min(rawLeft, win.width - MENU_WIDTH - 8));
  const below = a.y + a.height + 6;
  const top = props.up || below + h > win.height - 8 ? Math.max(8, a.y - h - 6) : below;
  return (
    <Modal transparent visible={fade.mounted} animationType="none" onRequestClose={props.onClose}>
      <ScaleRoot scale={scale}>
        <Animated.View style={{ flex: 1, opacity: fade.opacity }}>
          <Pressable
            style={{ flex: 1 }}
            onPress={props.onClose}
            {...({
              onContextMenu: (e: { preventDefault(): void }) => {
                e.preventDefault();
                props.onClose();
              },
            } as object)}
          >
            <View
              onLayout={(e) => setMeasured(Math.round(e.nativeEvent.layout.height))}
              style={[{ position: "absolute", left, top, width: MENU_WIDTH, padding: 2, borderRadius: 12, backgroundColor: colors.bg }, popoverShadow(dark)]}
            >
              {props.items.map((it) => (
                <Pressable
                  key={it.label}
                  accessibilityRole="menuitem"
                  accessibilityLabel={it.label}
                  accessibilityState={{ checked: !!it.checked }}
                  onPress={() => {
                    props.onClose();
                    it.onPress();
                  }}
                  style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
                    minHeight: ROW,
                    paddingVertical: 7,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 14,
                    borderRadius: 10,
                    backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
                  })}
                >
                  {it.icon && <Icon name={it.icon} size={18} color={it.danger ? colors.danger : colors.textSecondary} />}
                  <Text style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: 20, fontFamily, color: it.danger ? colors.danger : colors.text }}>
                    {it.label}
                  </Text>
                  {it.checked && <Icon name="check" size={18} color={colors.accent} />}
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Animated.View>
      </ScaleRoot>
    </Modal>
  );
}
