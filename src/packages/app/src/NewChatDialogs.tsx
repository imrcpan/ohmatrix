import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { UserSuggestion } from "@ohmatrix/core";
import { Avatar, Dialog, fontFamily, Icon, PrimaryButton, TextButton, TextField, useTheme } from "@ohmatrix/ui";
import { useController, useT } from "./context.js";
import { UserPicker } from "./UserPicker.js";

/** New one-to-one chat: search, tap a person, the chat opens. */
export function NewChatDialog(props: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setError(null);
    props.onClose();
  };
  return (
    <Dialog visible={props.visible} title={t("newChat")} message={t("newChat.body")} onClose={close}>
      <UserPicker
        onPick={(u) => {
          if (busy) return;
          setBusy(true);
          setError(null);
          controller
            .startDirectChat(u.userId)
            .then(close, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setBusy(false));
        }}
      />
      {!!error && <Text style={{ color: colors.danger, fontSize: 14, fontFamily, textAlign: "center" }}>{error}</Text>}
      <TextButton title={t("cancel")} onPress={close} />
    </Dialog>
  );
}

/** New group: a name plus any number of people picked from the directory (shown as removable chips). */
export function NewGroupDialog(props: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const [name, setName] = useState("");
  const [people, setPeople] = useState<UserSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setName("");
    setPeople([]);
    setError(null);
    props.onClose();
  };
  const toggle = (u: UserSuggestion) => setPeople((cur) => (cur.some((p) => p.userId === u.userId) ? cur.filter((p) => p.userId !== u.userId) : [...cur, u]));

  return (
    <Dialog visible={props.visible} title={t("newGroup")} message={t("newGroup.body")} onClose={close}>
      <TextField label={t("groupName")} value={name} onChangeText={setName} />
      {people.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {people.map((p) => (
            <Pressable
              key={p.userId}
              accessibilityRole="button"
              accessibilityLabel={t("removePerson", { name: p.displayName })}
              onPress={() => toggle(p)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                height: 30,
                paddingLeft: 4,
                paddingRight: 10,
                borderRadius: 15,
                backgroundColor: colors.bgSecondary,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Avatar id={p.userId} name={p.displayName} size={22} />
              <Text style={{ fontSize: 14, fontFamily, color: colors.text }}>{p.displayName}</Text>
              <Icon name="close" size={12} color={colors.textSecondary} />
            </Pressable>
          ))}
        </View>
      )}
      <UserPicker selected={people.map((p) => p.userId)} onPick={toggle} />
      {!!error && <Text style={{ color: colors.danger, fontSize: 14, fontFamily, textAlign: "center" }}>{error}</Text>}
      <PrimaryButton
        title={t("create")}
        loading={busy}
        disabled={!name.trim()}
        onPress={() => {
          setBusy(true);
          setError(null);
          controller
            .createGroup(
              name,
              people.map((p) => p.userId),
            )
            .then(close, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => setBusy(false));
        }}
      />
      <TextButton title={t("cancel")} onPress={close} />
    </Dialog>
  );
}
