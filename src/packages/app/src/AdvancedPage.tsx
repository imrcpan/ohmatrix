import { ScrollView, Text, View } from "react-native";
import { fontFamily, Toggle, useNavBottom, useTheme } from "@ohmatrix/ui";
import { useAppState, useController, useT } from "./context.js";
import { Group, Item, PageHeader } from "./settings/kit.js";

/** Advanced options, a page of its own: opened from Settings, which it slides in over. */
export function AdvancedPage() {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const nav = useNavBottom();
  const pull = useAppState((s) => s.prefs.pullToRefresh);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t("advanced.options")} onBack={() => controller.sidebarBack()} backLabel={t("settings")} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 + nav }}>
        <Group>
          <Item
            label={t("pullRefresh")}
            icon="refresh"
            chevron={false}
            right={<Toggle label={t("pullRefresh")} value={pull} onChange={(v) => controller.setPreferences({ pullToRefresh: v })} />}
          />
          <Text style={{ fontSize: 13, lineHeight: 18, fontFamily, color: colors.textSecondary, marginHorizontal: 18 }}>{t("pullRefresh.footer")}</Text>
          <Item label={t("logs.view")} icon="file" onPress={() => controller.openSidebarPage("logs")} />
        </Group>
      </ScrollView>
    </View>
  );
}
