import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import type { RoomDetails, RoomMember } from "@ohmatrix/core";
import { Avatar, Dialog, fontFamily, PrimaryButton, TextButton, useNavBottom, useTheme } from "@ohmatrix/ui";
import { useController, useServices, useT } from "./context.js";
import { Group, Item, PageHeader } from "./settings/kit.js";
import { useMediaUrl } from "./useMedia.js";
import { useNotice } from "./useNotice.js";

/** One member of a room: who they are, and what can be done with them (copy their link, write to them, block). */
export function MemberInfoPage(props: { d: RoomDetails; member: RoomMember; onBack: () => void }) {
  const { colors } = useTheme();
  const nav = useNavBottom();
  const t = useT();
  const controller = useController();
  const services = useServices();
  const notice = useNotice();
  const [confirm, setConfirm] = useState(false);
  const [chatting, setChatting] = useState(false);
  const [busy, setBusy] = useState(false);
  const m = props.member;
  const me = m.userId === props.d.me;
  const avatar = useMediaUrl(m.avatar, { width: 192, height: 192, fit: "crop" });

  const copyLink = () => {
    const link = `https://matrix.to/#/${m.userId}`;
    const nav = (globalThis as { navigator?: { clipboard?: { writeText(s: string): Promise<void> } } }).navigator;
    const write = services.copyText ?? nav?.clipboard?.writeText.bind(nav.clipboard);
    if (!write) return notice.show(t("copyFailed"), "error");
    void write(link).then(
      () => notice.show(t("copied")),
      () => notice.show(t("copyFailed"), "error"),
    );
  };
  // The chat that opens replaces this panel (selecting a room closes the chat info).
  const startChat = async () => {
    setBusy(true);
    try {
      await controller.startDirectChat(m.userId);
    } catch (e) {
      notice.show(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
      setChatting(false);
    }
  };
  const block = async () => {
    setBusy(true);
    try {
      await controller.blockUser(m.userId);
      setConfirm(false);
      notice.show(t("member.blocked"));
    } catch (e) {
      setConfirm(false);
      notice.show(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t("member.info")} onBack={props.onBack} backLabel={t("chatInfo")} />
      <ScrollView contentContainerStyle={{ paddingBottom: 28 + nav }}>
        <View style={{ alignItems: "center", paddingTop: 12, paddingHorizontal: 20, gap: 2 }}>
          <Avatar id={m.userId} name={m.name} size={72} src={avatar} />
          <Text
            numberOfLines={2}
            style={{ marginTop: 8, fontSize: 22, fontWeight: "700", letterSpacing: -0.3, fontFamily, color: colors.text, textAlign: "center" }}
          >
            {m.name}
          </Text>
          <Text selectable style={{ fontSize: 14, fontFamily, color: colors.textSecondary }}>
            {m.userId}
          </Text>
        </View>
        <Group>
          <Item label={t("member.copyLink")} icon="copy" chevron={false} onPress={copyLink} />
          {!me && <Item label={t("member.message")} icon="chat" chevron={false} onPress={() => setChatting(true)} />}
          {!me && controller.canVerify && (
            <Item label={t("member.verify")} icon="lock" chevron={false} onPress={() => void controller.verifyUser(m.userId).catch(() => {})} />
          )}
          {!me && <Item label={t("member.block")} icon="close" danger chevron={false} onPress={() => setConfirm(true)} />}
        </Group>
      </ScrollView>
      <Dialog visible={chatting} title={t("member.message.title", { name: m.name })} message={t("member.message.body")} onClose={() => setChatting(false)}>
        <PrimaryButton title={t("member.message.start")} loading={busy} onPress={() => void startChat()} />
        <TextButton title={t("cancel")} onPress={() => setChatting(false)} />
      </Dialog>
      <Dialog visible={confirm} title={t("member.block.title", { name: m.name })} message={t("member.block.body")} onClose={() => setConfirm(false)}>
        <PrimaryButton title={t("member.block")} loading={busy} onPress={() => void block()} />
        <TextButton title={t("cancel")} onPress={() => setConfirm(false)} />
      </Dialog>
    </View>
  );
}
