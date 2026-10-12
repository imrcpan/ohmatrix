import { Pressable, Text, View } from "react-native";
import { fontFamily, listThemes, SYSTEM_THEME, themeLabel, useTheme, type ThemeDefinition } from "@ohmatrix/ui";
import { useAppState, useController, useLocale, useT } from "./context.js";

function Preview({ def }: { def: ThemeDefinition }) {
  const c = def.colors;
  return (
    <View style={{ flex: 1, backgroundColor: c.chatBg, padding: 8, justifyContent: "center", gap: 5 }}>
      <View style={{ alignSelf: "flex-start", width: 34, height: 12, borderRadius: 6, backgroundColor: c.bubbleIn }} />
      <View style={{ alignSelf: "flex-end", width: 42, height: 12, borderRadius: 6, backgroundColor: c.bubbleOut }} />
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 7, backgroundColor: c.bg }} />
    </View>
  );
}

/** Theme picker built from the registry: any registered theme appears here automatically. */
export function ThemeGrid() {
  const { colors } = useTheme();
  const controller = useController();
  const t = useT();
  const locale = useLocale();
  const current = useAppState((s) => s.prefs.theme);
  const themes = listThemes();
  const light = themes.find((x) => x.id === "light")!;
  const dark = themes.find((x) => x.id === "dark")!;

  const card = (id: string, label: string, preview: React.ReactNode) => {
    const active = current === id;
    return (
      <Pressable
        key={id}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}
        onPress={() => controller.setPreferences({ theme: id })}
        style={{ width: 84, alignItems: "center", gap: 6 }}
      >
        <View style={{ width: 84, height: 72, borderRadius: 14, overflow: "hidden", borderWidth: 2, borderColor: active ? colors.accent : colors.separator }}>
          {preview}
        </View>
        <Text numberOfLines={1} style={{ fontSize: 13, fontFamily, fontWeight: active ? "600" : "400", color: active ? colors.accent : colors.text }}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14, padding: 14 }}>
      {card(
        SYSTEM_THEME,
        t("theme.system"),
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View style={{ flex: 1, overflow: "hidden" }}>
            <View style={{ width: 80, height: 68 }}>
              <Preview def={light} />
            </View>
          </View>
          <View style={{ flex: 1, overflow: "hidden" }}>
            <View style={{ width: 80, height: 68, marginLeft: -40 }}>
              <Preview def={dark} />
            </View>
          </View>
        </View>,
      )}
      {themes.map((def) => card(def.id, themeLabel(def, locale), <Preview def={def} />))}
    </View>
  );
}
