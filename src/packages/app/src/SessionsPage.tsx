import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { EngineError, type DeviceInfo } from "@ohmatrix/core";
import { Dialog, fontFamily, PrimaryButton, TextButton, TextField, useTheme, useNavBottom } from "@ohmatrix/ui";
import { useController, useLocale, useT } from "./context.js";
import { formatRelative } from "./format.js";
import { Item, PageHeader } from "./settings/kit.js";

type Pending = { ids: string[]; all: boolean } | null;

/** Where the account is signed in; other sessions can be signed out after confirming the password. */
export function SessionsPage() {
  const { colors } = useTheme();
  const nav = useNavBottom();
  const t = useT();
  const locale = useLocale();
  const controller = useController();
  const [devices, setDevices] = useState<DeviceInfo[] | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => controller.listDevices().then(setDevices, () => setDevices([])), [controller]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const close = () => {
    setPending(null);
    setPassword("");
    setError(null);
  };
  const confirm = () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    controller
      .removeDevices(pending.ids, password)
      .then(
        () => {
          close();
          void reload();
        },
        (e: unknown) => setError(e instanceof EngineError && e.code === "forbidden" ? t("sessions.wrongPassword") : e instanceof Error ? e.message : String(e)),
      )
      .finally(() => setBusy(false));
  };

  const now = Date.now();
  const current = devices?.find((d) => d.current);
  const others = devices?.filter((d) => !d.current) ?? [];
  const last = (d: DeviceInfo) =>
    d.lastSeenTs
      ? `${t("sessions.lastActive", { when: formatRelative(d.lastSeenTs, now, locale) })}${d.lastSeenIp ? ` · ${d.lastSeenIp}` : ""}`
      : t("sessions.neverSeen");

  const caption = (text: string) => (
    <Text style={{ fontSize: 14, fontWeight: "600", fontFamily, color: colors.accent, marginHorizontal: 18, marginBottom: 4 }}>{text}</Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t("sessions")} onBack={() => controller.sidebarBack()} backLabel={t("settings")} />
      {devices === null ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      ) : (
        // An account can have hundreds of sessions: the list is virtualised, so only the rows near the screen exist.
        // The grouped-card look is drawn per row (rounded first and last row of the group).
        <FlatList
          data={others}
          keyExtractor={(d) => d.id}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews
          contentContainerStyle={{ paddingBottom: 32 + nav }}
          ListHeaderComponent={
            <View>
              {current && (
                <View style={{ marginTop: 18 }}>
                  {caption(t("sessions.thisDevice"))}
                  <Item label={current.name} subtitle={last(current)} icon="device" />
                </View>
              )}
              <View style={{ marginTop: 18 }}>{caption(t("sessions.others"))}</View>
              {others.length === 0 && (
                <Text style={{ marginHorizontal: 18, paddingVertical: 8, fontSize: 15, fontFamily, color: colors.textSecondary }}>{t("sessions.empty")}</Text>
              )}
            </View>
          }
          renderItem={({ item: d }) => <Item label={d.name} subtitle={last(d)} icon="device" onPress={() => setPending({ ids: [d.id], all: false })} />}
          ListFooterComponent={
            others.length > 0 ? (
              <View>
                <Text style={{ fontSize: 13, lineHeight: 18, fontFamily, color: colors.textSecondary, marginHorizontal: 18, marginTop: -6 }}>
                  {t("sessions.footer")}
                </Text>
                <View style={{ marginTop: 14 }}>
                  <Item
                    label={t("sessions.signOutAll")}
                    icon="signOut"
                    danger
                    chevron={false}
                    onPress={() => setPending({ ids: others.map((d) => d.id), all: true })}
                  />
                </View>
              </View>
            ) : (
              <View />
            )
          }
        />
      )}
      <Dialog
        visible={!!pending}
        title={t(pending?.all ? "sessions.confirm.all" : "sessions.confirm.one")}
        message={t("sessions.confirm.body")}
        onClose={close}
      >
        <TextField label={t("password")} value={password} onChangeText={setPassword} secureTextEntry textContentType="password" onSubmitEditing={confirm} />
        {!!error && <Text style={{ color: colors.danger, fontSize: 14, fontFamily, textAlign: "center" }}>{error}</Text>}
        <PrimaryButton title={t("sessions.signOut")} loading={busy} disabled={!password} onPress={confirm} />
        <TextButton title={t("cancel")} onPress={close} />
      </Dialog>
    </View>
  );
}
