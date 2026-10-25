import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { Avatar, EllipsisText, fontFamily, ROW_HEIGHT, useTheme } from "@ohmatrix/ui";
import { useT } from "./context.js";
import type { Joining } from "./joining.js";
import { useMediaUrl } from "./useMedia.js";

function JoiningRow(props: { room: Joining }) {
  const { colors } = useTheme();
  const t = useT();
  const avatar = useMediaUrl(props.room.avatar, { width: 104, height: 104, fit: "crop" });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - props.room.since) / 1000));
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${t("explore.joining.item")}: ${props.room.name}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 11, marginHorizontal: 6, paddingHorizontal: 8, paddingVertical: 7, height: ROW_HEIGHT }}
    >
      <Avatar id={props.room.id} name={props.room.name} size={44} src={avatar} />
      <View style={{ flex: 1, gap: 3 }}>
        <EllipsisText style={{ fontSize: 16, fontWeight: "600", fontFamily, color: colors.text }}>{props.room.name}</EllipsisText>
        <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontFamily, color: colors.accent }}>
          {`${t("explore.joining.item")} (${seconds}s)`}
        </Text>
      </View>
      <ActivityIndicator color={colors.accent} />
    </View>
  );
}

/** Rooms still being joined, above everything in the chat list (above the pinned chats too). */
export function JoiningRows(props: { rooms: readonly Joining[] }) {
  return (
    <View>
      {props.rooms.map((r) => (
        <JoiningRow key={r.id} room={r} />
      ))}
    </View>
  );
}
