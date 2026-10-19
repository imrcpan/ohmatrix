import { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { fontFamily, Icon, useNavBottom, useTheme } from "@ohmatrix/ui";
import { useController, useServices, useT } from "./context.js";
import { Group, PageHeader } from "./settings/kit.js";

const CARD = 84;
const GAP = 12;
const COLUMNS = 4;
/** The picture inside a card: the choice as Settings shows it (the rounded shape of logo/colorful/). */
const PICTURE = 64;

/**
 * The app icon on the device's home screen, to choose from, as a page of its own (opened from Settings, which it slides in over). What
 * the cards show is the picture for the list; the device is given the full-square one of the same name, which its launcher shapes.
 */
export function AppIconPage() {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const icons = useServices().appIcons;
  const nav = useNavBottom();
  const [current, setCurrent] = useState(() => icons?.current() ?? "");
  const [problem, setProblem] = useState<string | null>(null);

  const choose = (id: string) => {
    if (!icons || id === current) return;
    setProblem(null);
    try {
      icons.set(id);
      setCurrent(id);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t("appIcon")} onBack={() => controller.sidebarBack()} backLabel={t("settings")} />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 + nav }}>
        <Group>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: GAP,
              padding: GAP,
              paddingTop: 20,
              maxWidth: CARD * COLUMNS + GAP * (COLUMNS - 1) + GAP * 2,
              alignSelf: "center",
            }}
          >
            {(icons?.list() ?? []).map((i) => {
              const active = i.id === current;
              const label = i.id;
              return (
                <Pressable
                  key={i.id}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ selected: active }}
                  onPress={() => choose(i.id)}
                  style={{ width: CARD, alignItems: "center", gap: 6 }}
                >
                  <View
                    style={{
                      width: CARD,
                      height: CARD,
                      borderRadius: 20,
                      borderWidth: 2.5,
                      borderColor: active ? colors.accent : "transparent",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Image source={i.preview} style={{ width: PICTURE, height: PICTURE }} resizeMode="contain" />
                    {active && (
                      <View
                        style={{
                          position: "absolute",
                          right: 2,
                          bottom: 2,
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: colors.accent,
                        }}
                      >
                        <Icon name="check" size={13} color={colors.onAccent} strokeWidth={3} />
                      </View>
                    )}
                  </View>
                  <Text numberOfLines={1} style={{ fontSize: 13, fontFamily, fontWeight: active ? "600" : "400", color: active ? colors.accent : colors.text }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Group>
        {!!problem && (
          <Text style={{ marginTop: 12, marginHorizontal: 18, textAlign: "center", fontSize: 14, fontFamily, color: colors.danger }}>{problem}</Text>
        )}
      </ScrollView>
    </View>
  );
}
