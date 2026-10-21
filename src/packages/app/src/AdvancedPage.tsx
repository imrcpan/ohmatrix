import { ScrollView, View } from "react-native";
import { useNavBottom, useTheme } from "@ohmatrix/ui";
import { useController, useT } from "./context.js";
import { Group, Item, PageHeader } from "./settings/kit.js";

/** Advanced options, a page of its own: opened from Settings, which it slides in over. */
export function AdvancedPage() {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const nav = useNavBottom();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t("advanced.options")} onBack={() => controller.sidebarBack()} backLabel={t("settings")} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 + nav }}>
        <Group>
          <Item label={t("logs.view")} icon="file" onPress={() => controller.openSidebarPage("logs")} />
        </Group>
      </ScrollView>
    </View>
  );
}
