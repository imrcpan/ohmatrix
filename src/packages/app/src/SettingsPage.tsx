import { useRef, useState, type ComponentRef } from "react";
import { ScrollView, Text, View } from "react-native";
import {
  Dialog,
  fontFamily,
  Icon,
  listThemes,
  Menu,
  PrimaryButton,
  SYSTEM_THEME,
  TextButton,
  themeLabel,
  Toggle,
  useTheme,
  type Anchor,
  useNavBottom,
} from "@ohmatrix/ui";
import { useAppState, useController, useLocale, useServices, useT } from "./context.js";
import { LANGUAGES } from "./languages.js";
import { Group, Item, PageHeader } from "./settings/kit.js";
import { useZoomChange } from "./useZoomChange.js";

/** The project page, opened outside the app from the About group. */
const REPOSITORY = "https://github.com/imrcpan/ohmatrix";
const SCALES = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

export function SettingsPage() {
  const { colors } = useTheme();
  const nav = useNavBottom();
  const t = useT();
  const locale = useLocale();
  const controller = useController();
  const services = useServices();
  const prefs = useAppState((s) => s.prefs);
  const system = services.notifications?.kind === "system";
  const [permission, setPermission] = useState(() => services.notifications?.permission() ?? "unsupported");
  const [confirm, setConfirm] = useState(false);
  const langRef = useRef<ComponentRef<typeof View>>(null);
  const [langAnchor, setLangAnchor] = useState<Anchor | null>(null);
  const [langMenu, setLangMenu] = useState(false);
  const scaleRef = useRef<ComponentRef<typeof View>>(null);
  const [scaleAnchor, setScaleAnchor] = useState<Anchor | null>(null);
  const [scaleMenu, setScaleMenu] = useState(false);
  const zoom = useZoomChange();
  const themeName = prefs.theme === SYSTEM_THEME ? t("theme.system") : themeLabel(listThemes().find((x) => x.id === prefs.theme) ?? listThemes()[0]!, locale);
  const current = LANGUAGES.find((l) => l.id === locale) ?? LANGUAGES[0];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t("settings")} onBack={() => controller.sidebarBack()} backLabel={t("profile")} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 + nav }}>
        <Group
          title={t("notifications")}
          footer={t(
            permission === "denied"
              ? system
                ? "notif.footer.deniedSystem"
                : "notif.footer.denied"
              : permission === "unsupported"
                ? system
                  ? "notif.footer.unsupportedSystem"
                  : "notif.footer.unsupported"
                : "notif.footer.default",
          )}
        >
          <Item
            label={t("notif.messages")}
            icon="bell"
            chevron={false}
            right={
              <Toggle
                label={t("notif.messages")}
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
          {services.push && (
            <>
              <Item
                label={t("push.enable")}
                icon="bell"
                chevron={false}
                right={<Toggle label={t("push.enable")} value={prefs.pushEnabled} onChange={(v) => controller.setPreferences({ pushEnabled: v })} />}
              />
            </>
          )}
          {prefs.notifications && permission === "granted" && (
            <Item
              label={t("notif.preview")}
              icon="mailUnread"
              chevron={false}
              right={
                <Toggle label={t("notif.preview")} value={prefs.notificationPreview} onChange={(v) => controller.setPreferences({ notificationPreview: v })} />
              }
            />
          )}
        </Group>
        <Group title={t("appearance")}>
          <View ref={langRef}>
            <Item
              label={t("language")}
              icon="chat"
              value={current.label}
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
          <View ref={scaleRef}>
            <Item
              label={t("zoom")}
              icon="zoomIn"
              value={`${Math.round(prefs.uiScale * 100)}%`}
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
          <Text style={{ fontSize: 13, lineHeight: 18, fontFamily, color: colors.textSecondary, marginHorizontal: 18, marginTop: -6 }}>{t("zoom.footer")}</Text>
          <Item label={t("theme")} icon="palette" value={themeName} onPress={() => controller.openSidebarPage("theme")} />
          {services.appIcons && <Item label={t("appIcon")} icon="image" onPress={() => controller.openSidebarPage("appIcon")} />}
        </Group>
        <Group title={t("sessions")}>
          <Item label={t("sessions")} icon="device" onPress={() => controller.openSidebarPage("sessions")} />
        </Group>
        <Group title={t("account")}>
          <Item label={t("signOut")} icon="signOut" danger onPress={() => setConfirm(true)} chevron={false} />
        </Group>
        <Group title={t("about")}>
          <Item label="GitHub" value={REPOSITORY.replace("https://", "")} icon="external" onPress={() => services.openLink?.(REPOSITORY)} />
          <Item label="OhMatrix" value={`${t("version")} ${services.appVersion ?? "dev"}`} icon="info" />
        </Group>
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
        fade={false}
        visible={scaleMenu}
        anchor={scaleAnchor}
        alignRight
        onClose={() => setScaleMenu(false)}
        items={SCALES.map((v) => ({
          label: `${Math.round(v * 100)}%`,
          checked: v === prefs.uiScale,
          onPress: () => zoom.start(v),
        }))}
      />
      {/* Not saved until Keep: left alone, the zoom goes back by itself when the time is up. */}
      <Dialog
        visible={!!zoom.trial}
        title={t("zoom.confirm.title")}
        message={t("zoom.confirm.body", { n: zoom.left, from: `${Math.round((zoom.trial?.from ?? 1) * 100)}%` })}
        onClose={zoom.revert}
        modal
      >
        <PrimaryButton title={t("zoom.confirm.keep")} onPress={zoom.keep} />
        <TextButton title={t("zoom.confirm.revert")} onPress={zoom.revert} />
      </Dialog>
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
