import { Modal, Pressable, Text, useWindowDimensions, View } from "react-native";
import { Icon, type IconName } from "./Icon.js";
import { fontFamily, useTheme } from "./theme.js";

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

const MENU_WIDTH = 220;
const ROW = 42;

/**
 * Popover menu anchored to a point or rectangle (Fluent flyout / macOS context menu): opens below the
 * anchor, flips above near the bottom edge, and is clamped inside the window.
 */
export function Menu(props: { visible: boolean; anchor: Anchor | null; items: MenuItem[]; onClose: () => void; alignRight?: boolean }) {
  const { colors } = useTheme();
  const win = useWindowDimensions();
  const a = props.anchor ?? { x: 0, y: 0, width: 0, height: 0 };
  const h = props.items.length * ROW + 8;
  const rawLeft = props.alignRight ? a.x + a.width - MENU_WIDTH : a.x;
  const left = Math.max(8, Math.min(rawLeft, win.width - MENU_WIDTH - 8));
  const below = a.y + a.height + 6;
  const top = below + h > win.height - 8 ? Math.max(8, a.y - h - 6) : below;
  return (
    <Modal transparent visible={props.visible} animationType="fade" onRequestClose={props.onClose}>
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
          style={{
            position: "absolute",
            left,
            top,
            width: MENU_WIDTH,
            padding: 4,
            borderRadius: 12,
            backgroundColor: colors.bg,
            borderWidth: 1,
            borderColor: colors.separator,
          }}
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
                height: ROW,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
              })}
            >
              {it.icon && <Icon name={it.icon} size={18} color={it.danger ? colors.danger : colors.textSecondary} />}
              <Text style={{ flex: 1, fontSize: 16, fontFamily, color: it.danger ? colors.danger : colors.text }}>{it.label}</Text>
              {it.checked && <Icon name="check" size={18} color={colors.accent} />}
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}
