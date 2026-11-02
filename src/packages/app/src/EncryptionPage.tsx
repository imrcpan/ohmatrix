import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useAppState, useController, useServices, useT } from "./context.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { ExportKeysDialog } from "./ExportKeysDialog.js";
import { SecuritySheet } from "./SecuritySheet.js";
import { Group, Item, PageHeader } from "./settings/kit.js";

/** Encryption of the account: its state, setting it up or unlocking the history, and exporting the keys. */
export function EncryptionPage() {
  const t = useT();
  const controller = useController();
  const services = useServices();
  const security = useAppState((s) => s.security);
  const [sheet, setSheet] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const encValue =
    security === "ready" ? t("enc.on") : security === "needs_setup" ? t("enc.setup") : security === "needs_recovery" ? t("enc.verify") : t("enc.unavailable");
  const actionable = security === "needs_setup" || security === "needs_recovery";

  return (
    <View style={{ flex: 1 }}>
      <PageHeader title={t("encryption")} onBack={() => controller.sidebarBack()} backLabel={t("profile")} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Group title={t("security")}>
          <Item label={t("encryption")} icon="lock" value={encValue} chevron={false} />
          {actionable && <Item label={t(security === "needs_setup" ? "sec.setup.title" : "sec.recovery.title")} icon="key" onPress={() => setSheet(true)} />}
          {controller.canExportKeys && services.saveFile && security === "ready" && (
            <Item label={t("keys.export")} icon="key" onPress={() => setExporting(true)} />
          )}
          {security === "ready" && <Item label={t("keys.reset")} icon="refresh" danger onPress={() => setConfirmReset(true)} chevron={false} />}
        </Group>
      </ScrollView>
      <ConfirmDialog
        visible={confirmReset}
        title={t("keys.reset")}
        message={t("keys.reset.body")}
        warning={t("keys.reset.warning")}
        confirmLabel={t("keys.reset.confirm")}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          setResetting(true);
        }}
      />
      <SecuritySheet visible={sheet || resetting} reset={resetting} onClose={() => (setSheet(false), setResetting(false))} />
      <ExportKeysDialog visible={exporting} onClose={() => setExporting(false)} />
    </View>
  );
}
