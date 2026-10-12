import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import type { RoomDetails, RoomMember } from "@ohmatrix/core";
import { Avatar, Dialog, fontFamily, IconButton, NavBar, PrimaryButton, Row, Section, TextButton, useTheme } from "@ohmatrix/ui";
import { useController, useT } from "./context.js";
import { useMediaUrl } from "./useMedia.js";

function MemberRow(props: { member: RoomMember; last: boolean }) {
  const { colors } = useTheme();
  const t = useT();
  const m = props.member;
  const avatar = useMediaUrl(m.avatar, { width: 72, height: 72, fit: "crop" });
  const tag = m.invited ? t("invited") : m.role === "admin" ? t("role.admin") : m.role === "moderator" ? t("role.moderator") : null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingLeft: 16, paddingRight: 14, minHeight: 54 }}>
      <Avatar id={m.userId} name={m.name} size={36} src={avatar} />
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          minHeight: 54,
          borderBottomWidth: props.last ? 0 : 1,
          borderBottomColor: colors.separator,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 16, fontFamily, color: colors.text }}>
            {m.name}
          </Text>
          <Text numberOfLines={1} selectable style={{ fontSize: 13, fontFamily, color: colors.textSecondary }}>
            {m.userId}
          </Text>
        </View>
        {tag && <Text style={{ fontSize: 13, fontFamily, color: m.invited ? colors.textSecondary : colors.accent }}>{tag}</Text>}
      </View>
    </View>
  );
}

/** Chat info: avatar, name, topic, address, encryption, members, and leave/delete. */
export function RoomInfoPanel(props: { roomId: string; mode: "dock" | "overlay" }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const [d, setD] = useState<RoomDetails | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const avatar = useMediaUrl(d?.avatar, { width: 192, height: 192, fit: "crop" });

  useEffect(() => {
    setD(null);
    return controller.subscribeRoomDetails(props.roomId, setD);
  }, [controller, props.roomId]);

  const direct = d?.isDirect ?? false;
  const joined = d?.members.filter((m) => !m.invited).length ?? 0;
  const title = direct ? t("userInfo") : t("groupInfo");
  const close = () => controller.openRoomInfo(false);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSecondary }}>
      <NavBar
        title={title}
        onBack={props.mode === "overlay" ? close : undefined}
        backLabel={t("close")}
        trailing={props.mode === "dock" ? <IconButton icon="close" label={t("close")} color={colors.textSecondary} size={20} onPress={close} /> : undefined}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
        {d && (
          <>
            <View style={{ alignItems: "center", paddingTop: 24, paddingHorizontal: 20, gap: 4 }}>
              <Avatar id={d.id} name={d.name} size={96} src={avatar} />
              <Text numberOfLines={2} style={{ marginTop: 8, fontSize: 22, fontWeight: "700", fontFamily, color: colors.text, textAlign: "center" }}>
                {d.name}
              </Text>
              <Text style={{ fontSize: 14, fontFamily, color: colors.textSecondary }}>
                {direct ? t("directChat") : joined === 1 ? t("member.one") : t("members", { n: joined })}
              </Text>
            </View>
            <Section title={t("about")}>
              {!!d.topic && <Row label={t("topic")} value={d.topic} />}
              <Row label={t("address")} value={d.alias ?? d.id} />
              <Row
                label={t("encryption")}
                icon="lock"
                iconColor={d.isEncrypted ? "#34C759" : colors.textSecondary}
                value={d.isEncrypted ? t("enc.on") : t("enc.off")}
                last
              />
            </Section>
            <Section title={direct ? t("participant") : `${t("membersTitle")} · ${d.members.length}`}>
              {d.members.map((m, i) => (
                <MemberRow key={m.userId} member={m} last={i === d.members.length - 1} />
              ))}
            </Section>
            <Section>
              <Row label={direct ? t("deleteChat") : t("leaveGroup")} danger last chevron={false} onPress={() => setConfirm(true)} />
            </Section>
          </>
        )}
      </ScrollView>
      <Dialog
        visible={confirm}
        title={t(direct ? "deleteChat.title" : "leaveGroup.title")}
        message={t(direct ? "deleteChat.body" : "leaveGroup.body")}
        onClose={() => setConfirm(false)}
      >
        <PrimaryButton
          title={direct ? t("deleteChat") : t("leaveGroup")}
          loading={busy}
          onPress={() => {
            setBusy(true);
            void controller
              .leaveRoom(props.roomId)
              .catch(() => {})
              .finally(() => {
                setBusy(false);
                setConfirm(false);
              });
          }}
        />
        <TextButton title={t("cancel")} onPress={() => setConfirm(false)} />
      </Dialog>
    </View>
  );
}
