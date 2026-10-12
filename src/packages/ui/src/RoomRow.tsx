import { Pressable, Text, View } from "react-native";
import { Avatar } from "./Avatar.js";
import { EllipsisText } from "./EllipsisText.js";
import { Icon } from "./Icon.js";
import type { Anchor } from "./Menu.js";
import { fontFamily, useTheme } from "./theme.js";

export const ROW_HEIGHT = 62;

/** Chat list row (fixed height; title and preview are single lines ending in "..."): 44px avatar, bold title + time, preview + unread pill. Selected = accent fill on desktop. */
export function RoomRow(props: {
  id: string;
  title: string;
  preview: string;
  time: string;
  unread: number;
  highlight?: boolean;
  selected?: boolean;
  avatarUrl?: string | undefined;
  onPress: () => void;
  pinned?: boolean | undefined;
  markedUnread?: boolean | undefined;
  muted?: boolean | undefined;
  /** Long-press (touch) or right-click (desktop): receives where to anchor the menu. */
  onContextMenu?: ((anchor: Anchor) => void) | undefined;
  /** Pending invitation: shows Accept / Decline pills under the preview. */
  invite?: { acceptLabel: string; declineLabel: string; onAccept: () => void; onDecline: () => void } | undefined;
}) {
  const { colors } = useTheme();
  const sel = !!props.selected;
  const secondary = sel ? colors.onSelectedSecondary : colors.textSecondary;
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      onLongPress={(e) => {
        const n = e.nativeEvent as { pageX?: number; pageY?: number };
        props.onContextMenu?.({ x: n.pageX ?? 0, y: n.pageY ?? 0, width: 0, height: 0 });
      }}
      {...({
        onContextMenu: (e: { preventDefault(): void; clientX: number; clientY: number }) => {
          if (!props.onContextMenu) return;
          e.preventDefault();
          props.onContextMenu({ x: e.clientX, y: e.clientY, width: 0, height: 0 });
        },
      } as object)}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        marginHorizontal: 6,
        paddingHorizontal: 8,
        paddingVertical: 7,
        ...(props.invite ? {} : { height: ROW_HEIGHT }),
        borderRadius: 12,
        backgroundColor: sel ? colors.selected : pressed ? colors.separator : hovered ? colors.hover : "transparent",
      })}
    >
      <Avatar id={props.id} name={props.title} size={44} src={props.avatarUrl} />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <EllipsisText style={{ flex: 1, fontSize: 16, fontWeight: "600", fontFamily, color: sel ? colors.onSelected : colors.text }}>
            {props.title}
          </EllipsisText>
          {props.muted && <Icon name="bellOff" size={13} color={secondary} />}
          {props.pinned && <Icon name="pin" size={13} color={secondary} />}
          <Text style={{ fontSize: 13, fontFamily, color: secondary }}>{props.time}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <EllipsisText style={{ flex: 1, fontSize: 15, lineHeight: 20, fontFamily, color: secondary }}>{props.preview}</EllipsisText>
          {props.unread === 0 && props.markedUnread && (
            <View
              accessibilityLabel="Marked unread"
              style={{ width: 12, height: 12, borderRadius: 6, marginRight: 4, backgroundColor: sel ? colors.onSelected : colors.badge }}
            />
          )}
          {props.unread > 0 && (
            <View
              style={{
                minWidth: 22,
                height: 22,
                borderRadius: 11,
                paddingHorizontal: 7,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: sel ? colors.onSelected : props.muted ? colors.badgeMuted : colors.badge,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", fontFamily, color: sel ? colors.selected : colors.onAccent }}>
                {props.unread > 99 ? "99+" : props.unread}
              </Text>
            </View>
          )}
        </View>
        {props.invite && (
          <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
            <Pressable
              accessibilityRole="button"
              onPress={props.invite.onAccept}
              style={({ pressed }) => ({
                backgroundColor: sel ? colors.onSelected : colors.accent,
                borderRadius: 14,
                paddingHorizontal: 16,
                paddingVertical: 6,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: sel ? colors.selected : colors.onAccent, fontSize: 14, fontWeight: "600", fontFamily }}>{props.invite.acceptLabel}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={props.invite.onDecline}
              style={({ pressed }) => ({
                backgroundColor: colors.bgSecondary,
                borderRadius: 14,
                paddingHorizontal: 16,
                paddingVertical: 6,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: "500", fontFamily }}>{props.invite.declineLabel}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Pressable>
  );
}
