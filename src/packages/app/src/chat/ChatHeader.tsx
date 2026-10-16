import { Pressable, Text, View } from "react-native";
import type { RoomSummary } from "@ohmatrix/core";
import { fontFamily, IconButton, useTheme } from "@ohmatrix/ui";
import { useT } from "../context.js";
import { typingLabel } from "../format.js";

export const HEADER_HEIGHT = 56;

/** The bar above a chat: back (portrait), who it is with, search, and the info button. */
export function ChatHeader(props: {
  room: RoomSummary | undefined;
  typing: string[];
  searching: boolean;
  onToggleSearch(): void;
  onBack?: (() => void) | undefined;
  onInfo?: (() => void) | undefined;
}) {
  const { colors } = useTheme();
  const t = useT();
  const { room, typing } = props;
  return (
    <View
      style={{
        height: HEADER_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingRight: 12,
        // The back button brings its own space in portrait; without it (landscape) the name needs some of its own.
        paddingLeft: props.onBack ? 12 : 20,
        backgroundColor: colors.bg,
        borderBottomWidth: 1,
        borderBottomColor: colors.separator,
      }}
    >
      {props.onBack && <IconButton icon="back" label="Back" size={26} onPress={props.onBack} />}
      {/* Name and member count open the chat info, exactly like the info button. Only that small block is
          clickable (not the whole title bar), with no background feedback: the name just dims while pressed. */}
      <Pressable
        accessibilityRole={props.onInfo ? "button" : undefined}
        disabled={!props.onInfo}
        onPress={props.onInfo}
        style={{ flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 }}
      >
        {({ pressed }: { pressed: boolean }) => (
          <>
            <View style={{ flexShrink: 1 }}>
              <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "600", fontFamily, color: colors.text, opacity: props.onInfo && pressed ? 0.5 : 1 }}>
                {room?.name ?? ""}
              </Text>
              {room && (
                <Text numberOfLines={1} style={{ fontSize: 13, fontFamily, color: typing.length ? colors.accent : colors.textSecondary }}>
                  {typing.length
                    ? typingLabel(typing, t, room.isDirect)
                    : room.isDirect
                      ? t("directChat")
                      : room.memberCount === 1
                        ? t("member.one")
                        : t("members", { n: room.memberCount })}
                </Text>
              )}
            </View>
          </>
        )}
      </Pressable>
      <View style={{ flex: 1 }} />
      <IconButton
        icon="search"
        label={t("search.inChat")}
        size={22}
        color={props.searching ? colors.accent : colors.textSecondary}
        onPress={props.onToggleSearch}
      />
      {props.onInfo && <IconButton icon="info" label={t("chatInfo")} size={24} onPress={props.onInfo} />}
    </View>
  );
}
