import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Avatar, Dialog, fontFamily, Icon, PrimaryButton, TextButton, TextField, useTheme } from "@ohmatrix/ui";
import { EngineError } from "@ohmatrix/core";
import { useAppState, useController, useServices, useT } from "./context.js";
import { SecuritySheet } from "./SecuritySheet.js";
import { Group, Item, PageHeader } from "./settings/kit.js";
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
  const [editingStatus, setEditingStatus] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);
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
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t("profile")} onBack={() => controller.sidebarBack()} backLabel={t("chats")} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ alignItems: "center", paddingTop: 4, paddingBottom: 4, gap: 2 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={t("changePhoto")} onPress={() => void changePhoto()} disabled={!services.pickFiles}>
            <Avatar id={profile?.userId ?? "?"} name={displayName || "?"} size={72} src={avatar} />
          </Pressable>
          <Text style={{ fontSize: 22, fontWeight: "700", letterSpacing: -0.3, fontFamily, color: colors.text, marginTop: 8 }}>{displayName}</Text>
          <Text selectable style={{ fontSize: 15, fontFamily, color: colors.textSecondary }}>
            {profile?.userId}
          </Text>
        </View>
        <Group title={t("account")}>
          {services.pickFiles && <Item label={t("changePhoto")} icon="camera" onPress={() => void changePhoto()} />}
          <Item
            label={t("name")}
            value={displayName}
            icon="user"
            onPress={() => {
              setName(displayName);
              setEditing(true);
            }}
          />
          <Item
            label={t("status")}
            icon="smile"
            value={profile?.status ?? t("status.empty")}
            onPress={() => {
              setStatusText(profile?.status ?? "");
              setStatusError(null);
              setEditingStatus(true);
            }}
          />
          <Item label={t("userId")} value={profile?.userId} icon="hash" />
          <Item label={t("homeserver")} value={props.homeserver} icon="info" />
        </Group>
        <Group title={t("security")}>
          <Item label={t("encryption")} icon="lock" value={encValue} onPress={actionable ? () => setSheet(true) : undefined} />
        </Group>
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
      <Dialog visible={editingStatus} title={t("status.edit")} onClose={() => setEditingStatus(false)}>
        <TextField label={t("status")} placeholder={t("status.placeholder")} value={statusText} onChangeText={(v) => setStatusText(v.slice(0, 100))} />
        {!!statusError && <Text style={{ color: colors.danger, fontSize: 14, fontFamily, textAlign: "center" }}>{statusError}</Text>}
        <PrimaryButton
          title={t("save")}
          loading={busy}
          onPress={() => {
            setBusy(true);
            setStatusError(null);
            controller
              .setStatus(statusText)
              .then(
                () => setEditingStatus(false),
                (e: unknown) =>
                  setStatusError(e instanceof EngineError && e.code === "unsupported" ? t("status.unsupported") : e instanceof Error ? e.message : String(e)),
              )
              .finally(() => setBusy(false));
          }}
        />
        <TextButton title={t("cancel")} onPress={() => setEditingStatus(false)} />
      </Dialog>
      <SecuritySheet visible={sheet} onClose={() => setSheet(false)} />
    </View>
  );
}
