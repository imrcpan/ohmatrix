import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import type { UserSuggestion } from "@ohmatrix/core";
import { Avatar, fontFamily, Icon, SearchField, useTheme } from "@ohmatrix/ui";
import { useController, useT } from "./context.js";
import { useMediaUrl } from "./useMedia.js";

function Result(props: { user: UserSuggestion; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const avatar = useMediaUrl(props.user.avatar, { width: 72, height: 72, fit: "crop" });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.user.displayName}
      accessibilityState={{ selected: props.selected }}
      onPress={props.onPress}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 8,
        height: 52,
        borderRadius: 10,
        backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
      })}
    >
      <Avatar id={props.user.userId} name={props.user.displayName} size={36} src={avatar} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, fontFamily, color: colors.text }}>
          {props.user.displayName}
        </Text>
        <Text numberOfLines={1} style={{ fontSize: 13, fontFamily, color: colors.textSecondary }}>
          {props.user.userId}
        </Text>
      </View>
      {props.selected && <Icon name="check" size={20} color={colors.accent} />}
    </Pressable>
  );
}

/** Debounced user-directory search with a result list; `selected` ids show a check (multi-select). */
export function UserPicker(props: { selected?: readonly string[]; onPick: (u: UserSuggestion) => void }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setResults([]);
      setSearched("");
      setBusy(false);
      return;
    }
    setBusy(true);
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      controller.searchUsers(term).then(
        (r) => {
          if (mine === seq.current) {
            setResults(r);
            setSearched(term);
            setBusy(false);
          }
        },
        () => {
          if (mine === seq.current) {
            setResults([]);
            setSearched(term);
            setBusy(false);
          }
        },
      );
    }, 250);
    return () => clearTimeout(timer);
  }, [query, controller]);

  return (
    <View style={{ gap: 8 }}>
      <SearchField value={query} onChangeText={setQuery} placeholder={t("searchPeople")} />
      <ScrollView style={{ maxHeight: 232 }} keyboardShouldPersistTaps="handled">
        {busy && results.length === 0 ? (
          <View style={{ height: 52, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.textSecondary} />
          </View>
        ) : results.length > 0 ? (
          results.map((u) => <Result key={u.userId} user={u} selected={props.selected?.includes(u.userId) ?? false} onPress={() => props.onPick(u)} />)
        ) : (
          <Text style={{ textAlign: "center", paddingVertical: 14, fontSize: 14, fontFamily, color: colors.textSecondary }}>
            {searched ? t("noPeople") : t("searchHint")}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}
