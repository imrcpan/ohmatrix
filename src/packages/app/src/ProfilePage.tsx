import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Avatar, Dialog, fontFamily, Icon, NavBar, PrimaryButton, Row, Section, TextButton, TextField, useTheme } from "@ohmatrix/ui";
import { useAppState, useController, useServices, useT } from "./context.js";
import { SecuritySheet } from "./SecuritySheet.js";
import { useMediaUrl } from "./useMedia.js";

export function ProfilePage(props: { homeserver: string }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const services = useServices();
  const profile = useAppState((s) => s.profile);
  const security = useAppState((s) => s.security);
  const avatar = useMediaUrl(profile?.avatar, { width: 192, height: 192, fit: "crop" });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  const encValue =
    security === "ready" ? t("enc.on") : security === "needs_setup" ? t("enc.setup") : security === "needs_recovery" ? t("enc.verify") : t("enc.unavailable");
  const actionable = security === "needs_setup" || security === "needs_recovery";
  const displayName = profile?.displayName ?? "";
  const changePhoto = async () => {
    const [file] = (await services.pickFiles?.()) ?? [];
    if (file) await controller.setAvatar(file).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSecondary }}>
      <NavBar title={t("profile")} onBack={() => controller.sidebarBack()} backLabel={t("chats")} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ alignItems: "center", paddingTop: 28, paddingBottom: 6, gap: 6, backgroundColor: colors.bgSecondary }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("changePhoto")} onPress={() => void changePhoto()} disabled={!services.pickFiles}>
            <Avatar id={profile?.userId ?? "?"} name={displayName || "?"} size={96} src={avatar} />
          </Pressable>
          {services.pickFiles && <TextButton title={t("changePhoto")} onPress={() => void changePhoto()} />}
          <Text style={{ fontSize: 24, fontWeight: "700", fontFamily, color: colors.text }}>{displayName}</Text>
          <Text selectable style={{ fontSize: 15, fontFamily, color: colors.textSecondary }}>
            {profile?.userId}
          </Text>
        </View>
        <Section title={t("account")}>
          <Row
            label={t("name")}
            value={displayName}
            onPress={() => {
              setName(displayName);
              setEditing(true);
            }}
          />
          <Row label={t("userId")} value={profile?.userId} />
          <Row label={t("homeserver")} value={props.homeserver} last />
        </Section>
        <Section title={t("security")}>
          <Row
            label={t("encryption")}
            icon="lock"
            iconColor={security === "ready" ? "#34C759" : colors.accent}
            value={encValue}
            last
            onPress={actionable ? () => setSheet(true) : undefined}
          />
        </Section>
      </ScrollView>
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.separator,
          backgroundColor: colors.bg,
          paddingHorizontal: 8,
          paddingVertical: 6,
          alignItems: "flex-start",
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("settings")}
          onPress={() => controller.openSidebarPage("settings")}
          style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 12,
            height: 40,
            borderRadius: 10,
            backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
          })}
        >
          <Icon name="gear" size={22} color={colors.accent} />
          <Text style={{ fontSize: 16, fontWeight: "500", fontFamily, color: colors.accent }}>{t("settings")}</Text>
        </Pressable>
      </View>
      <Dialog visible={editing} title={t("editName")} onClose={() => setEditing(false)}>
        <TextField label={t("name")} value={name} onChangeText={setName} autoCapitalize="words" />
        <PrimaryButton
          title={t("save")}
          loading={busy}
          disabled={!name.trim()}
          onPress={() => {
            setBusy(true);
            void controller
              .setDisplayName(name)
              .then(() => setEditing(false))
              .catch(() => {})
              .finally(() => setBusy(false));
          }}
        />
        <TextButton title={t("cancel")} onPress={() => setEditing(false)} />
      </Dialog>
      <SecuritySheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}
