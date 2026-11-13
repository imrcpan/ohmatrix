import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { PublicRoom } from "@ohmatrix/core";
import { DialogFrame, fontFamily, Pulse, SkeletonBlock, useTheme, useViewport } from "@ohmatrix/ui";
import { useServices, useT } from "./context.js";
import { CardFace } from "./ExploreScreen.js";
import { useMediaUrl } from "./useMedia.js";

/**
 * A room that is not joined, as the large card of the explore page shows it: who it is, what it is about, and the buttons to copy its address and to
 * join it. It opens at once, with what is known of the room; while the server has not told more (`loading`), the people and the text are grey bars.
 */
export function RoomCardDialog(props: { visible: boolean; room: PublicRoom; loading: boolean; onClose: () => void; onJoin: () => void }) {
  const { colors } = useTheme();
  const t = useT();
  const services = useServices();
  const { width: window, height: viewport } = useViewport();
  const { room } = props;
  const avatar = useMediaUrl(room.avatar, { width: 112, height: 112, fit: "crop" });
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const copyAddress = () => {
    const nav = (globalThis as { navigator?: { clipboard?: { writeText(s: string): Promise<void> } } }).navigator;
    const write = services.copyText ?? nav?.clipboard?.writeText.bind(nav.clipboard);
    void write?.(room.alias ?? room.roomId).then(
      () => setCopied(true),
      () => {},
    );
  };
  const topicStyle = { fontSize: 14, lineHeight: 19, fontFamily, color: colors.textSecondary };
  return (
    <DialogFrame visible={props.visible} onClose={props.onClose}>
      <Pressable onPress={() => {}} style={{ borderRadius: 16, padding: 16, gap: 10, width: Math.min(window - 48, 560), backgroundColor: colors.bgSecondary }}>
        <CardFace
          room={room}
          avatar={avatar}
          loading={props.loading}
          topic={
            props.loading ? (
              <Pulse>
                <View style={{ gap: 9, paddingVertical: 4 }}>
                  <SkeletonBlock width="100%" height={12} />
                  <SkeletonBlock width="92%" height={12} />
                  <SkeletonBlock width="55%" height={12} />
                </View>
              </Pulse>
            ) : (
              <ScrollView style={{ maxHeight: Math.max(160, viewport * 0.5) }}>
                <Text selectable style={topicStyle}>
                  {room.topic?.trim() ?? ""}
                </Text>
              </ScrollView>
            )
          }
          actions={
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("explore.copy")}
                onPress={copyAddress}
                style={({ pressed }) => ({
                  borderRadius: 14,
                  paddingHorizontal: 16,
                  paddingVertical: 6,
                  opacity: pressed ? 0.7 : 1,
                  backgroundColor: colors.hover,
                })}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", fontFamily, color: colors.text }}>{copied ? t("copied") : t("explore.copy")}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t("join")} ${room.name}`}
                onPress={() => {
                  props.onClose();
                  props.onJoin();
                }}
                style={({ pressed }) => ({
                  borderRadius: 14,
                  paddingHorizontal: 16,
                  paddingVertical: 6,
                  opacity: pressed ? 0.7 : 1,
                  backgroundColor: colors.accent,
                })}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", fontFamily, color: colors.onAccent }}>{t("join")}</Text>
              </Pressable>
            </>
          }
        />
      </Pressable>
    </DialogFrame>
  );
}
