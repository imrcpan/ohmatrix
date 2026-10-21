import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import type { RoomSummary } from "@ohmatrix/core";
import { Avatar, Dialog, fontFamily, Icon, PrimaryButton, SearchField, TextButton, useTheme } from "@ohmatrix/ui";
import { useAppState, useController, useT } from "./context.js";

/** A room to pick: its picture, its name, and a round box that is ticked when it is picked. */
const CheckRow = memo(function CheckRow(props: { room: RoomSummary; checked: boolean; onToggle: (id: string) => void; disabled?: boolean }) {
  const { colors } = useTheme();
  const r = props.room;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={r.name}
      aria-checked={props.checked}
      aria-disabled={!!props.disabled}
      accessibilityState={{ checked: props.checked, disabled: !!props.disabled }}
      disabled={props.disabled}
      onPress={() => props.onToggle(r.id)}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 6,
        paddingHorizontal: 8,
        borderRadius: 10,
        backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
      })}
    >
      <Avatar id={r.id} name={r.name} size={36} src={r.avatarUrl} />
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontFamily, color: colors.text }}>
        {r.name}
      </Text>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: props.checked ? colors.accent : colors.textTertiary,
          backgroundColor: props.checked ? colors.accent : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {props.checked && <Icon name="check" size={14} color={colors.onAccent} strokeWidth={3} />}
      </View>
    </Pressable>
  );
});

/**
 * Forwarding a message, in two steps. First the chats to send it to are ticked (any number, with a filter box). Forward then asks once
 * more, listing only the ones ticked, all still ticked, so a wrong one can be taken off; Forward there sends. Messages are copied into each
 * chat (text, mentions and attachments); if some chats could not be sent to, the dialog stays and says how many.
 */
export function ForwardDialog(props: { visible: boolean; onClose: () => void; fromRoomId: string; eventIds: readonly string[]; onSent?: () => void }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const rooms = useAppState((s) => s.rooms);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [keep, setKeep] = useState<ReadonlySet<string>>(new Set());
  const [sending, setSending] = useState(false);
  // Between pressing Forward in the first step and the second step being drawn: the button turns while it is drawn.
  const [preparing, setPreparing] = useState(false);
  const [failed, setFailed] = useState(0);

  const postable = useMemo(() => rooms.filter((r) => !r.invite), [rooms]);
  const shown = useMemo(() => postable.filter((r) => !filter || r.name.toLowerCase().includes(filter.toLowerCase())), [postable, filter]);
  // The chats chosen in the first step, in the order of the list (not of the clicks).
  const chosen = useMemo(() => postable.filter((r) => picked.has(r.id)), [postable, picked]);
  const toggle = (set: ReadonlySet<string>, id: string) => {
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    return next;
  };

  const close = () => {
    props.onClose();
    setFilter("");
    setPicked(new Set());
    setConfirming(false);
    setFailed(0);
  };
  const confirm = () => {
    if (preparing) return;
    setPreparing(true);
    // The turning button is drawn first; the second step (which may take a moment on a phone) follows.
    setTimeout(() => {
      setKeep(new Set(chosen.map((r) => r.id))); // all of them ticked to begin with
      setFailed(0);
      setConfirming(true);
      setPreparing(false);
    }, 50);
  };
  const send = async () => {
    const targets = chosen.filter((r) => keep.has(r.id));
    if (!targets.length || sending) return;
    setSending(true);
    const left = new Set<string>();
    for (const r of targets) {
      try {
        for (const id of props.eventIds) await controller.forwardMessage(props.fromRoomId, id, r.id);
      } catch {
        left.add(r.id);
      }
    }
    setSending(false);
    if (left.size === 0) {
      close();
      props.onSent?.();
    } else {
      // What was sent is done with: only the chats that failed stay, ticked, for another try.
      setPicked(left);
      setKeep(left);
      setFailed(left.size);
    }
  };

  const togglePicked = useCallback((id: string) => setPicked((p) => toggle(p, id)), []);
  const toggleKeep = useCallback((id: string) => setKeep((k) => toggle(k, id)), []);
  const renderPick = useCallback(
    ({ item }: { item: RoomSummary }) => <CheckRow room={item} checked={picked.has(item.id)} onToggle={togglePicked} />,
    [picked, togglePicked],
  );
  const renderKeep = useCallback(
    ({ item }: { item: RoomSummary }) => <CheckRow room={item} checked={keep.has(item.id)} disabled={sending} onToggle={toggleKeep} />,
    [keep, sending, toggleKeep],
  );

  // One dialog for both steps, its content changing: a second dialog would have to be opened (a window of its own, slow on a phone)
  // when Forward is pressed, and the lists are virtualised, so that a long list of chats is not drawn all at once.
  return (
    <Dialog visible={props.visible} title={confirming ? t("forward.confirm") : t("forward.title")} onClose={close} modal={confirming}>
      {confirming ? (
        <>
          <FlatList
            style={{ maxHeight: 300 }}
            data={chosen}
            extraData={keep}
            keyExtractor={(r) => r.id}
            renderItem={renderKeep}
            initialNumToRender={10}
            keyboardShouldPersistTaps="handled"
          />
          {failed > 0 && <Text style={{ color: colors.danger, fontSize: 14, fontFamily, textAlign: "center" }}>{t("forward.failed", { n: failed })}</Text>}
          <TextButton title={t("back")} onPress={() => setConfirming(false)} />
          <PrimaryButton title={t("forward")} loading={sending} disabled={keep.size === 0} onPress={() => void send()} />
        </>
      ) : (
        <>
          <SearchField value={filter} onChangeText={setFilter} placeholder={t("search")} />
          <FlatList
            style={{ maxHeight: 300 }}
            data={shown}
            extraData={picked}
            keyExtractor={(r) => r.id}
            renderItem={renderPick}
            initialNumToRender={10}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={{ padding: 12, textAlign: "center", fontSize: 14, fontFamily, color: colors.textSecondary }}>{t("forward.empty")}</Text>
            }
          />
          <TextButton title={t("cancel")} onPress={close} />
          <PrimaryButton
            title={picked.size ? `${t("forward")} (${picked.size})` : t("forward")}
            loading={preparing}
            disabled={picked.size === 0}
            onPress={confirm}
          />
        </>
      )}
    </Dialog>
  );
}
