import { ScrollView, View } from "react-native";
import { Bubble, Chip, useNavBottom, useTheme } from "@ohmatrix/ui";
import { useController, useT } from "./context.js";
import { PageHeader } from "./settings/kit.js";
import { ThemeGrid } from "./ThemeGrid.js";

/** A small chat, drawn with the real bubbles in the theme as it is now: it changes the moment another theme is chosen. */
function ChatPreview() {
  const { colors } = useTheme();
  const t = useT();
  return (
    <View
      accessibilityLabel={t("theme.preview")}
      style={{ backgroundColor: colors.chatBg, borderTopWidth: 1, borderTopColor: colors.separator, paddingTop: 12, paddingBottom: 22, gap: 6 }}
    >
      <Chip text={t("today")} />
      <View style={{ paddingHorizontal: 10, alignItems: "flex-start" }}>
        <Bubble own={false} text={t("theme.preview.in")} time="9:41" />
      </View>
      <View style={{ paddingHorizontal: 10, alignItems: "flex-end" }}>
        <Bubble own text={t("theme.preview.out")} time="9:42" status="read" />
      </View>
    </View>
  );
}

/**
 * The theme picker, a page of its own: opened from Theme in Settings, which it slides in over. A sample chat stays at the top and does
 * not scroll, so each theme can be tried and seen at once; the themes to choose from scroll under it.
 */
export function ThemePage() {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const nav = useNavBottom();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t("theme")} onBack={() => controller.sidebarBack()} backLabel={t("settings")} />
      <ChatPreview />
      <View style={{ height: 1, backgroundColor: colors.separator }} />
      <ScrollView contentContainerStyle={{ paddingTop: 20, paddingBottom: 24 + nav }}>
        <ThemeGrid />
      </ScrollView>
    </View>
  );
}
