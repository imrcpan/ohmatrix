import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { EngineError, type DeviceInfo } from "@ohmatrix/core";
import { Dialog, fontFamily, NavBar, PrimaryButton, Row, Section, TextButton, TextField, useTheme } from "@ohmatrix/ui";
import { useController, useLocale, useT } from "./context.js";
import { formatRelative } from "./format.js";

type Pending = { ids: string[]; all: boolean } | null;

/** Where the account is signed in; other sessions can be signed out after confirming the password. */
export function SessionsPage() {
  const { colors } = useTheme();
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

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSecondary }}>
      <NavBar title={t("sessions")} onBack={() => controller.sidebarBack()} backLabel={t("settings")} />
      {devices === null ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {current && (
            <Section title={t("sessions.thisDevice")}>
              <Row label={current.name} subtitle={last(current)} icon="device" iconColor="#34C759" last />
            </Section>
          )}
          <Section title={t("sessions.others")} footer={others.length ? t("sessions.footer") : undefined}>
            {others.length === 0 && <Text style={{ padding: 16, fontSize: 15, fontFamily, color: colors.textSecondary }}>{t("sessions.empty")}</Text>}
            {others.map((d, i) => (
              <Row
                key={d.id}
                label={d.name}
                subtitle={last(d)}
                icon="device"
                iconColor={colors.textSecondary}
                last={i === others.length - 1}
                onPress={() => setPending({ ids: [d.id], all: false })}
              />
            ))}
          </Section>
          {others.length > 0 && (
            <Section>
              <Row label={t("sessions.signOutAll")} danger last chevron={false} onPress={() => setPending({ ids: others.map((d) => d.id), all: true })} />
            </Section>
          )}
        </ScrollView>
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
