import { useRef, useState, type ComponentRef } from "react";
import { ScrollView, Text, View } from "react-native";
import { Dialog, fontFamily, Icon, Menu, NavBar, PrimaryButton, Row, Section, TextButton, Toggle, useTheme, type Anchor } from "@ohmatrix/ui";
import { useAppState, useController, useLocale, useServices, useT } from "./context.js";
import { ThemeGrid } from "./ThemeGrid.js";

/** Language names are shown in their own language on purpose and are not translated. */
const SCALES = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "zh-CN", label: "简体中文" },
] as const;

export function SettingsPage() {
  const { colors } = useTheme();
  const t = useT();
  const locale = useLocale();
  const controller = useController();
  const services = useServices();
  const prefs = useAppState((s) => s.prefs);
  const [permission, setPermission] = useState(() => services.notifications?.permission() ?? "unsupported");
  const [confirm, setConfirm] = useState(false);
  const langRef = useRef<ComponentRef<typeof View>>(null);
  const [langAnchor, setLangAnchor] = useState<Anchor | null>(null);
  const [langMenu, setLangMenu] = useState(false);
  const scaleRef = useRef<ComponentRef<typeof View>>(null);
  const [scaleAnchor, setScaleAnchor] = useState<Anchor | null>(null);
  const [scaleMenu, setScaleMenu] = useState(false);
  const current = LANGUAGES.find((l) => l.id === locale) ?? LANGUAGES[0];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSecondary }}>
      <NavBar title={t("settings")} onBack={() => controller.sidebarBack()} backLabel={t("profile")} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <Section title={t("appearance")}>
          <ThemeGrid />
        </Section>
        <Section>
          <View ref={langRef}>
            <Row
              label={t("language")}
              value={current.label}
              last
              chevron={false}
              right={<Icon name="chevronDown" size={16} color={colors.textTertiary} />}
              onPress={() =>
                langRef.current?.measureInWindow((x, y, width, height) => {
                  setLangAnchor({ x, y, width, height });
                  setLangMenu(true);
                })
              }
            />
          </View>
        </Section>
        <Section footer={t("zoom.footer")}>
          <View ref={scaleRef}>
            <Row
              label={t("zoom")}
              value={`${Math.round(prefs.uiScale * 100)}%`}
              last
              chevron={false}
              right={<Icon name="chevronDown" size={16} color={colors.textTertiary} />}
              onPress={() =>
                scaleRef.current?.measureInWindow((x, y, width, height) => {
                  setScaleAnchor({ x, y, width, height });
                  setScaleMenu(true);
                })
              }
            />
          </View>
        </Section>
        <Section
          title={t("notifications")}
          footer={t(permission === "denied" ? "notif.footer.denied" : permission === "unsupported" ? "notif.footer.unsupported" : "notif.footer.default")}
        >
          <Row
            label={t("notif.desktop")}
            last={!prefs.notifications}
            chevron={false}
            right={
              <Toggle
                label={t("notif.desktop")}
                value={prefs.notifications && permission === "granted"}
                disabled={permission === "unsupported"}
                onChange={(on) => {
                  if (!on) {
                    controller.setPreferences({ notifications: false });
                    return;
                  }
                  void (async () => {
                    const result = permission === "granted" ? "granted" : await services.notifications?.request();
                    setPermission(result ?? "unsupported");
                    controller.setPreferences({ notifications: result === "granted" });
                  })();
                }}
              />
            }
          />
          {prefs.notifications && permission === "granted" && (
            <Row
              label={t("notif.preview")}
              last
              chevron={false}
              right={
                <Toggle label={t("notif.preview")} value={prefs.notificationPreview} onChange={(v) => controller.setPreferences({ notificationPreview: v })} />
              }
            />
          )}
        </Section>
        <Section title={t("sessions")}>
          <Row label={t("sessions")} icon="device" last onPress={() => controller.openSidebarPage("sessions")} />
        </Section>
        <Section title={t("account")}>
          <Row label={t("signOut")} danger last onPress={() => setConfirm(true)} chevron={false} />
        </Section>
        <Section title={t("about")}>
          <Row label="OhMatrix" value={`${t("version")} 0.1.0`} last />
        </Section>
        <Text style={{ textAlign: "center", marginTop: 24, fontSize: 12, fontFamily, color: colors.textSecondary }}>OhMatrix · GPL-3.0</Text>
      </ScrollView>
      <Menu
        visible={langMenu}
        anchor={langAnchor}
        alignRight
        onClose={() => setLangMenu(false)}
        items={LANGUAGES.map((l) => ({ label: l.label, checked: l.id === locale, onPress: () => controller.setPreferences({ locale: l.id }) }))}
      />
      <Menu
        visible={scaleMenu}
        anchor={scaleAnchor}
        alignRight
        onClose={() => setScaleMenu(false)}
        items={SCALES.map((v) => ({
          label: `${Math.round(v * 100)}%`,
          checked: v === prefs.uiScale,
          onPress: () => controller.setPreferences({ uiScale: v }),
        }))}
      />
      <Dialog visible={confirm} title={t("signOut.title")} message={t("signOut.body")} onClose={() => setConfirm(false)}>
        <PrimaryButton
          title={t("signOut")}
          onPress={() => {
            setConfirm(false);
            void controller.logout();
          }}
        />
        <TextButton title={t("cancel")} onPress={() => setConfirm(false)} />
      </Dialog>
    </View>
  );
}
