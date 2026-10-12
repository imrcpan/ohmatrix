import { useRef, useState, type ComponentRef } from "react";
import { ScrollView, Text, View } from "react-native";
import { Dialog, fontFamily, Icon, Menu, NavBar, PrimaryButton, Row, Section, TextButton, useTheme, type Anchor } from "@ohmatrix/ui";
import { useController, useLocale, useT } from "./context.js";
import { ThemeGrid } from "./ThemeGrid.js";

/** Language names are shown in their own language on purpose and are not translated. */
const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "zh-CN", label: "简体中文" },
] as const;

export function SettingsPage() {
  const { colors } = useTheme();
  const t = useT();
  const locale = useLocale();
  const controller = useController();
  const [confirm, setConfirm] = useState(false);
  const langRef = useRef<ComponentRef<typeof View>>(null);
  const [langAnchor, setLangAnchor] = useState<Anchor | null>(null);
  const [langMenu, setLangMenu] = useState(false);
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
