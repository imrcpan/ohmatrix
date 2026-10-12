import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { UserSuggestion } from "@ohmatrix/core";
import { Avatar, Dialog, fontFamily, Icon, PrimaryButton, TextButton, useTheme } from "@ohmatrix/ui";
import { useController, useT } from "./context.js";
import { UserPicker } from "./UserPicker.js";

/** Pick any number of people and invite them to a room. People already in the room are not offered twice. */
export function InviteDialog(props: { visible: boolean; roomId: string; onClose: () => void }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const [people, setPeople] = useState<UserSuggestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setPeople([]);
    setError(null);
    props.onClose();
  };
  const toggle = (u: UserSuggestion) => setPeople((cur) => (cur.some((p) => p.userId === u.userId) ? cur.filter((p) => p.userId !== u.userId) : [...cur, u]));

  return (
    <Dialog visible={props.visible} title={t("room.invite")} message={t("room.inviteBody")} onClose={close}>
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
        title={people.length ? t("room.inviteAction", { n: people.length }) : t("room.inviteNone")}
        loading={busy}
        disabled={people.length === 0}
        onPress={() => {
          setBusy(true);
          setError(null);
          controller.roomAdmin
            .invite(
              props.roomId,
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
