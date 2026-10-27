import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Dialog, fontFamily, Icon, PrimaryButton, SearchField, TextButton, useTheme } from "@ohmatrix/ui";
import { useT } from "./context.js";

const ROW_HEIGHT = 40;
const LIST_HEIGHT = 280;

/** The installed fonts to choose the interface's from: a search field over the list (each name drawn in its own font) and a confirm button. `null` is the system's own. */
export function FontDialog(props: {
  visible: boolean;
  fonts: string[];
  current: string | null;
  onConfirm: (font: string | null) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const t = useT();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(props.current);
  useEffect(() => {
    if (!props.visible) return;
    setQuery("");
    setPicked(props.current);
  }, [props.visible]);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [null, ...props.fonts.filter((f) => f.toLowerCase().includes(needle))].filter(
      (f) => f !== null || !needle || t("font.system").toLowerCase().includes(needle),
    );
  }, [props.fonts, query, t]);
  return (
    <Dialog visible={props.visible} title={t("font")} onClose={props.onClose}>
      <SearchField value={query} onChangeText={setQuery} placeholder={t("font.search")} autoFocus />
      <View style={{ height: LIST_HEIGHT }}>
        <FlatList
          data={shown}
          keyExtractor={(f) => f ?? ""}
          getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={{ textAlign: "center", paddingVertical: 24, fontSize: 15, fontFamily, color: colors.textSecondary }}>{t("font.empty")}</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: picked === item }}
              onPress={() => setPicked(item)}
              style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
                height: ROW_HEIGHT,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 10,
                borderRadius: 10,
                backgroundColor: pressed || hovered ? colors.hover : "transparent",
              })}
            >
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: colors.text, ...(item ? { fontFamily: `"${item}"` } : { fontFamily }) }}>
                {item ?? t("font.system")}
              </Text>
              {picked === item && <Icon name="check" size={18} color={colors.accent} strokeWidth={3} />}
            </Pressable>
          )}
        />
      </View>
      <PrimaryButton title={t("confirm")} onPress={() => props.onConfirm(picked)} />
      <TextButton title={t("cancel")} onPress={props.onClose} />
    </Dialog>
  );
}
