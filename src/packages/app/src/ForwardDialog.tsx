import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text } from "react-native";
import { Avatar, Dialog, fontFamily, PrimaryButton, SearchField, TextButton, useTheme } from "@ohmatrix/ui";
import { useAppState, useController, useT } from "./context.js";

/**
 * "Forward to" picker: the rooms I can post in, most recent first, with a filter box. Forwarding a
 * message copies it into the target room (text, mentions and attachments).
 */
export function ForwardDialog(props: { visible: boolean; onClose: () => void; fromRoomId: string; eventId: string }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const rooms = useAppState((s) => s.rooms);
  const [filter, setFilter] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const candidates = useMemo(() => rooms.filter((r) => !r.invite && (!filter || r.name.toLowerCase().includes(filter.toLowerCase()))), [rooms, filter]);
  const send = (roomId: string) => {
    setSending(roomId);
    void controller
      .forwardMessage(props.fromRoomId, props.eventId, roomId)
      .catch(() => {})
      .finally(() => {
        setSending(null);
        props.onClose();
        setFilter("");
      });
  };
  return (
    <Dialog visible={props.visible} title={t("forward.title")} onClose={props.onClose}>
      <SearchField value={filter} onChangeText={setFilter} placeholder={t("search")} />
      <ScrollView style={{ maxHeight: 300 }}>
        {candidates.length === 0 && (
          <Text style={{ padding: 12, textAlign: "center", fontSize: 14, fontFamily, color: colors.textSecondary }}>{t("forward.empty")}</Text>
        )}
        {candidates.map((r) => (
          <Pressable
            key={r.id}
            accessibilityRole="button"
            accessibilityLabel={r.name}
            disabled={!!sending}
            onPress={() => send(r.id)}
            style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingVertical: 6,
              paddingHorizontal: 8,
              borderRadius: 10,
              backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
            })}
          >
            <Avatar id={r.id} name={r.name} size={36} src={r.avatarUrl} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontFamily, color: colors.text }}>
              {r.name}
            </Text>
            {sending === r.id && <Text style={{ fontSize: 13, fontFamily, color: colors.accent }}>{t("forward.done")}</Text>}
          </Pressable>
        ))}
      </ScrollView>
      <TextButton title={t("cancel")} onPress={props.onClose} />
      <PrimaryButton title={t("forward")} onPress={() => (candidates[0] ? send(candidates[0].id) : undefined)} disabled={!candidates.length} />
    </Dialog>
  );
}
