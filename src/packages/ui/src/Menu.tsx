import { useRef, useState } from "react";
import { Animated, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { ScaleRoot } from "./Scale.js";
import { useScale } from "./viewport.js";
import { useInsets, useUnzoom, useViewport } from "./viewport.js";
import { placeMenu } from "./menuPlace.js";
import { Icon, type IconName } from "./Icon.js";
import { fontFamily } from "./theme.js";
import { MENU_PAD, MENU_ROW, rowStyle, useMenuLook } from "./menuKit.js";
import { useMenuMotion } from "./menuMotion.js";
import { originAt } from "./menuTimeline.js";

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

/**
 * Popover menu anchored to a point or rectangle: opens below the anchor (or above it with `up`), flips above near the bottom edge,
 * and is clamped inside the window. It looks like the menu of a chat bubble (see `useMenuLook`) and opens and closes like every menu
 * (see `useMenuMotion`), growing from the anchor.
 */
export function Menu(props: {
  visible: boolean;
  anchor: Anchor | null;
  items: MenuItem[];
  onClose: () => void;
  alignRight?: boolean;
  up?: boolean;
  width?: number;
  /** The menu opens and closes with its motion (the default). A menu that something else follows at once has none. */
  fade?: boolean;
}) {
  const look = useMenuLook();
  const win = useViewport();
  const scale = useScale();
  const un = useUnzoom();
  // Keep the last position and the last rows while the menu closes (closing clears the anchor, and a list made from it may become empty).
  const last = useRef<Anchor | null>(props.anchor);
  if (props.anchor) last.current = props.anchor;
  const kept = useRef(props.items);
  if (props.visible || props.items.length) kept.current = props.items;
  const items = props.visible || props.items.length ? props.items : kept.current;
  const motion = useMenuMotion(props.visible, { rows: items.length, enabled: props.fade !== false });
  const raw = props.anchor ?? last.current ?? { x: 0, y: 0, width: 0, height: 0 };
  const a = { x: un(raw.x), y: un(raw.y), width: un(raw.width), height: un(raw.height) };
  // A row is as tall as its text needs (a long name goes on a second line, never cut off), so the menu's height is what it measured to be;
  // until it has been measured, the height of rows of one line.
  const [measured, setMeasured] = useState(0);
  const h = measured || items.length * MENU_ROW + 2 * MENU_PAD;
  // The menu is the same component for every use, so what was measured for one list is not kept for the next.
  const lastItems = useRef(items);
  if (lastItems.current !== items && lastItems.current.length !== items.length) {
    lastItems.current = items;
    if (measured) setMeasured(0);
  }
  const MENU_WIDTH = props.width ?? DEFAULT_WIDTH;
  const rawLeft = props.alignRight ? a.x + a.width - MENU_WIDTH : a.x;
  const left = Math.max(8, Math.min(rawLeft, win.width - MENU_WIDTH - 8));
  // The menu stays clear of the status bar at the top and the gesture bar at the bottom, and is cut to the room there is (and scrolls).
  const insets = useInsets();
  const {
    top,
    height: shown,
    scrolls,
    above,
  } = placeMenu({
    y: a.y,
    height: a.height,
    contentHeight: h,
    up: !!props.up,
    minTop: Math.max(8, insets.top + 8),
    bottomLimit: win.height - Math.max(8, insets.bottom + (insets.navBottom ?? 0) + 8),
  });
  // It grows from the anchor: the edge of the button it is under (or over), or the pointer.
  const origin = originAt((props.alignRight ? a.x + a.width : a.x) - left, (above ? a.y : a.y + a.height) - top, MENU_WIDTH, scrolls ? shown : h);
  return (
    <Modal transparent visible={motion.mounted} animationType="none" onRequestClose={props.onClose}>
      <ScaleRoot scale={scale}>
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
          <Animated.View
            accessibilityRole="menu"
            style={[
              look.panel,
              { position: "absolute", left, top, width: MENU_WIDTH, transformOrigin: origin },
              scrolls ? { height: shown } : {},
              motion.panel,
            ]}
          >
            <ScrollView scrollEnabled={scrolls} showsVerticalScrollIndicator={scrolls} keyboardShouldPersistTaps="handled" bounces={false}>
              <View onLayout={(e) => setMeasured(Math.round(e.nativeEvent.layout.height))} style={{ paddingVertical: MENU_PAD }}>
                {items.map((it, i) => (
                  <Animated.View key={it.label} style={motion.row(i)}>
                    <Pressable
                      accessibilityRole="menuitem"
                      accessibilityLabel={it.label}
                      accessibilityState={{ checked: !!it.checked }}
                      onPress={() => {
                        props.onClose();
                        it.onPress();
                      }}
                      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
                        minHeight: MENU_ROW,
                        paddingVertical: 7,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        ...rowStyle(look, { pressed, hovered }),
                      })}
                    >
                      {it.icon && <Icon name={it.icon} size={18} color={it.danger ? look.danger : look.fg} />}
                      <Text style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: 20, fontFamily, color: it.danger ? look.danger : look.fg }}>
                        {it.label}
                      </Text>
                      {it.checked && <Icon name="check" size={18} color={look.colors.accent} />}
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            </ScrollView>
          </Animated.View>
        </Pressable>
      </ScaleRoot>
    </Modal>
  );
}
