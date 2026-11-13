import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Modal, Pressable, Text, View } from "react-native";
import { ScaleRoot } from "./Scale.js";
import { useScale } from "./viewport.js";
import { useUnzoom, useViewport } from "./viewport.js";
import { fontFamily, radius, useTheme } from "./theme.js";
import { Icon, type IconName } from "./Icon.js";
import { mix } from "./themes.js";
import { MENU_PAD, MENU_ROW, rowFill, rowStyle, useMenuLook } from "./menuKit.js";
import { useMenuMotion } from "./menuMotion.js";
import { originAt } from "./menuTimeline.js";

export interface SheetAction {
  label: string;
  icon?: IconName;
  onPress: () => void;
  danger?: boolean;
}
/** Window position the menu opens at: the mouse pointer, or the finger that long-pressed. */
export interface MenuPoint {
  x: number;
  y: number;
}

const MENU_WIDTH = 240;
const EMOJI = 36;
const GAP = 4;

/**
 * Context menu of a message (long-press / right-click): a quick-reaction bar and an action list that pop up
 * at the pointer, in the colours and corner shape of the other person's bubble (so it
 * follows the theme, the same for every message), without borders. This is the look every menu has (see `useMenuLook`),
 * and it grows from the pointer like every menu (see `useMenuMotion`). No full-screen dimming: a transparent layer
 * only catches the click-away.
 */
export function MessageMenu(props: {
  visible: boolean;
  onClose: () => void;
  anchor: MenuPoint | null;
  emojis: readonly string[];
  activeEmojis?: readonly string[];
  onEmoji: (emoji: string) => void;
  actions: SheetAction[];
}) {
  const look = useMenuLook();
  const win = useViewport();
  const scale = useScale();
  const un = useUnzoom();
  // The bar of reactions comes in as the first row, and the actions after it.
  const bar = props.emojis.length > 0 ? 1 : 0;
  const motion = useMenuMotion(props.visible, { rows: bar + props.actions.length });
  // Closing clears the anchor while the menu is still closing: keep the last position so it closes in place.
  const last = useRef<MenuPoint | null>(props.anchor);
  if (props.anchor) last.current = props.anchor;
  const raw = props.anchor ?? last.current ?? { x: 0, y: 0 };
  const a = { x: un(raw.x), y: un(raw.y) };
  const done = (f: () => void) => () => {
    props.onClose();
    f();
  };
  // Escape closes the menu (the web Modal only reports it while focus is inside).
  useEffect(() => {
    const doc = (
      globalThis as {
        document?: {
          addEventListener(t: string, f: (e: { key: string }) => void): void;
          removeEventListener(t: string, f: (e: { key: string }) => void): void;
        };
      }
    ).document;
    if (!props.visible || !doc) return;
    const onKey = (e: { key: string }) => {
      if (e.key === "Escape") props.onClose();
    };
    doc.addEventListener("keydown", onKey);
    return () => doc.removeEventListener("keydown", onKey);
  }, [props.visible, props.onClose]);

  const { fg, hover, danger } = look;

  const barW = props.emojis.length * EMOJI + 8;
  const width = Math.max(MENU_WIDTH, barW);
  const height = (props.emojis.length ? EMOJI + 8 + GAP : 0) + props.actions.length * MENU_ROW + 2 * MENU_PAD;
  // Opens at the pointer, towards the free side: right/down by default, left/up when it would not fit.
  const toLeft = a.x + width > win.width - 8;
  const above = a.y + height > win.height - 8 && a.y - height >= 8;
  const left = Math.max(8, toLeft ? a.x - width : a.x);
  const top = Math.max(8, Math.min(above ? a.y - height : a.y, win.height - height - 8));
  // The corner at the pointer stays tight, like a bubble's tail corner.
  const tight = above
    ? toLeft
      ? { borderBottomRightRadius: radius.bubbleTight }
      : { borderBottomLeftRadius: radius.bubbleTight }
    : toLeft
      ? { borderTopRightRadius: radius.bubbleTight }
      : { borderTopLeftRadius: radius.bubbleTight };

  return (
    <Modal transparent visible={motion.mounted} animationType="none" onRequestClose={props.onClose}>
      <ScaleRoot scale={scale}>
        <Pressable
          accessibilityLabel="Close menu"
          onPress={props.onClose}
          style={{ flex: 1 }}
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
              {
                position: "absolute",
                left,
                top,
                width,
                gap: GAP,
                alignItems: toLeft ? "flex-end" : "flex-start",
                transformOrigin: originAt(a.x - left, a.y - top, width, height),
              },
              motion.panel,
            ]}
          >
            {props.emojis.length > 0 && (
              <Animated.View style={motion.row(0)}>
                <View style={[look.panel, { flexDirection: "row", padding: 4, borderRadius: radius.pill }, !props.actions.length ? tight : {}]}>
                  {props.emojis.map((e) => (
                    <Pressable
                      key={e}
                      accessibilityRole="button"
                      accessibilityLabel={`React ${e}`}
                      onPress={done(() => props.onEmoji(e))}
                      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
                        width: EMOJI,
                        height: EMOJI,
                        borderRadius: EMOJI / 2,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: props.activeEmojis?.includes(e) ? hover : rowFill(look, { pressed, hovered }),
                      })}
                    >
                      <Text style={{ fontSize: 22 }}>{e}</Text>
                    </Pressable>
                  ))}
                </View>
              </Animated.View>
            )}
            {props.actions.length > 0 && (
              <View style={[look.panel, { width: MENU_WIDTH, paddingVertical: MENU_PAD }, tight]}>
                {props.actions.map((act, i) => (
                  <Animated.View key={act.label} style={motion.row(bar + i)}>
                    <Pressable
                      accessibilityRole="menuitem"
                      accessibilityLabel={act.label}
                      onPress={done(act.onPress)}
                      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
                        height: MENU_ROW,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        ...rowStyle(look, { pressed, hovered }),
                      })}
                    >
                      {act.icon && <Icon name={act.icon} size={18} color={act.danger ? danger : fg} />}
                      <Text style={{ fontSize: 15, fontFamily, color: act.danger ? danger : fg }}>{act.label}</Text>
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            )}
          </Animated.View>
        </Pressable>
      </ScaleRoot>
    </Modal>
  );
}

/**
 * Reaction pills under a bubble. They wear the bubble's colours (outgoing or incoming, so they follow the theme
 * too); the ones I added are a step stronger, pulled towards the text colour. A key is an emoji, free text, or the
 * `mxc://` address of a custom emoji: `image` draws the last (it needs the app's media loading).
 */
export function ReactionChips(props: {
  items: { key: string; count: number; mine: boolean }[];
  own: boolean;
  onToggle: (key: string) => void;
  image?: ((mxc: string) => ReactNode) | undefined;
}) {
  const { colors } = useTheme();
  const base = props.own ? colors.bubbleOut : colors.bubbleIn;
  const fg = props.own ? colors.bubbleOutText : colors.bubbleInText;
  const strong = mix(base, fg, 0.2);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 3 }}>
      {props.items.map((r) => {
        const custom = r.key.startsWith("mxc://");
        return (
          <Pressable
            key={r.key}
            accessibilityRole="button"
            accessibilityLabel={custom ? `${r.count}` : `${r.key} ${r.count}`}
            accessibilityState={{ selected: r.mine }}
            onPress={() => props.onToggle(r.key)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              height: 26,
              maxWidth: 220,
              paddingHorizontal: 9,
              borderRadius: 13,
              backgroundColor: r.mine ? strong : base,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            {custom ? (
              (props.image?.(r.key) ?? null)
            ) : (
              <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, fontFamily, color: fg }}>
                {r.key}
              </Text>
            )}
            {r.count > 1 || !r.mine ? <Text style={{ fontSize: 13, fontWeight: r.mine ? "700" : "600", fontFamily, color: fg }}>{r.count}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
