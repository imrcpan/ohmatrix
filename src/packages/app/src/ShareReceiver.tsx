import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import type { RoomSummary, SharedContent } from "@ohmatrix/core";
import { Avatar, Dialog, fontFamily, Icon, IconButton, PrimaryButton, RoomRowSkeleton, SearchField, TextButton, useNavBottom, useTheme } from "@ohmatrix/ui";
import { useAppState, useController, useServices, useT } from "./context.js";
import { shareInbox, useShareInbox } from "./shareInbox.js";
import { useBackHandler } from "./useBackHandler.js";
import { useMediaUrl } from "./useMedia.js";

const PAD = 16;

/** One chat to choose: its picture and name. */
const TargetRow = memo(function TargetRow(props: { room: RoomSummary; checked: boolean; disabled?: boolean; onToggle: (id: string) => void }) {
  const { colors } = useTheme();
  const r = props.room;
  const avatar = useMediaUrl(r.avatar, { width: 72, height: 72, fit: "crop" });
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={r.name}
      accessibilityState={{ checked: props.checked, disabled: !!props.disabled }}
      disabled={props.disabled}
      onPress={() => props.onToggle(r.id)}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderRadius: 10,
        backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
      })}
    >
      <Avatar id={r.id} name={r.name} size={44} src={avatar} shape={r.isSpace ? "square" : "circle"} />
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

/** A line saying what is being shared: the text, or how many files. */
export function describeShare(c: SharedContent, t: ReturnType<typeof useT>): string {
  const parts: string[] = [];
  if (c.files.length) parts.push(c.files.length === 1 ? t("share.file") : t("share.files", { count: c.files.length }));
  const text = c.text?.replace(/\s+/g, " ").trim();
  if (text) parts.push(text.length > 60 ? `${text.slice(0, 60)}…` : text);
  return parts.join(" · ") || t("share.text");
}

/**
 * The page that asks which chats what another app shared is for. It is the first screen when the app was started by the share (the rest of the
 * app is not drawn until it is done), and a layer over the app when it was already running. The chats are grey shapes until they are known.
 */
export function SharePage() {
  const services = useServices();
  const controller = useController();
  const t = useT();
  const rooms = useAppState((s) => s.rooms);
  const settled = useAppState((s) => s.roomsSettled);
  const inbox = useShareInbox();
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  // The second step, as when a message is forwarded: the chats chosen are listed once more, all ticked, so a wrong one can be taken off; Send there sends.
  const [confirming, setConfirming] = useState(false);
  const [keep, setKeep] = useState<ReadonlySet<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(0);
  const waiting = inbox.current();

  const postable = useMemo(() => rooms.filter((r) => !r.invite && !r.isSpace), [rooms]);
  const shown = useMemo(() => postable.filter((r) => !filter || r.name.toLowerCase().includes(filter.toLowerCase())), [postable, filter]);
  // The chats chosen in the first step, in the order of the list (not of the clicks).
  const chosen = useMemo(() => postable.filter((r) => picked.has(r.id)), [postable, picked]);
  const flip = (set: ReadonlySet<string>, id: string) => {
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    return next;
  };
  const toggle = useCallback((id: string) => setPicked((p) => flip(p, id)), []);
  const toggleKeep = useCallback((id: string) => setKeep((k) => flip(k, id)), []);
  const confirm = () => {
    setKeep(new Set(picked)); // all of them ticked to begin with
    setFailed(0);
    setConfirming(true);
  };
  const close = () => {
    shareInbox.clear();
    setFilter("");
    setPicked(new Set());
    setKeep(new Set());
    setConfirming(false);
    setFailed(0);
  };
  // Sent to each chosen chat in turn; the chats that could not be sent to stay chosen for another try.
  const send = async () => {
    if (!waiting || sending || keep.size === 0) return;
    setSending(true);
    const left = new Set<string>();
    // The copies of the files are waited for and the size of the pictures found out now, once for all the chats.
    let files = waiting.files;
    try {
      files = (await services.incomingShare?.prepare?.(waiting.files)) ?? files;
    } catch {
      setSending(false);
      setFailed(keep.size);
      return;
    }
    for (const id of chosen.map((r) => r.id).filter((id) => keep.has(id))) {
      try {
        await controller.sendShared(id, { ...(waiting.text ? { text: waiting.text } : {}), files });
      } catch {
        left.add(id);
      }
    }
    setSending(false);
    if (left.size === 0) close();
    else {
      // What was sent is done with: only the chats that failed stay, ticked, for another try.
      setPicked(left);
      setKeep(left);
      setFailed(left.size);
    }
  };
  const { colors } = useTheme();
  const nav = useNavBottom();
  // The platform's back gives the share up, before it leaves the app.
  useBackHandler(waiting ? () => (close(), true) : null);
  if (!waiting) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.bg, zIndex: 20 }]}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: PAD - 8, height: 56 }}>
          <IconButton icon="close" label={t("cancel")} onPress={close} />
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 20, fontWeight: "700", fontFamily, color: colors.text }}>
            {t("share.title")}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: picked.size === 0 }}
            disabled={picked.size === 0}
            onPress={confirm}
            style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
              height: 40,
              justifyContent: "center",
              paddingHorizontal: 12,
              marginRight: 4,
              borderRadius: 10,
              opacity: picked.size === 0 ? 0.4 : 1,
              backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
            })}
          >
            <Text style={{ fontSize: 16, fontWeight: "600", fontFamily, color: colors.accent }}>
              {picked.size > 0 ? `${t("send.files.send")} (${picked.size})` : t("send.files.send")}
            </Text>
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: PAD, paddingBottom: 10, gap: 10 }}>
          <Text numberOfLines={2} style={{ fontSize: 14, fontFamily, color: colors.textSecondary }}>
            {describeShare(waiting, t)}
          </Text>
          <SearchField value={filter} onChangeText={setFilter} placeholder={t("search")} />
        </View>
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: PAD - 8, paddingBottom: 8 + nav }}
          data={shown}
          extraData={picked}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => <TargetRow room={item} checked={picked.has(item.id)} onToggle={toggle} />}
          initialNumToRender={14}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            settled ? null : (
              <View>
                {Array.from({ length: 10 }, (_, i) => (
                  <RoomRowSkeleton key={i} index={i} />
                ))}
              </View>
            )
          }
        />
      </View>
      <Dialog visible={confirming} title={t("forward.confirm")} onClose={() => setConfirming(false)} modal>
        <FlatList
          style={{ maxHeight: 300 }}
          data={chosen}
          extraData={keep}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => <TargetRow room={item} checked={keep.has(item.id)} disabled={sending} onToggle={toggleKeep} />}
          initialNumToRender={10}
          keyboardShouldPersistTaps="handled"
        />
        {failed > 0 && <Text style={{ color: colors.danger, fontSize: 14, fontFamily, textAlign: "center" }}>{t("forward.failed", { n: failed })}</Text>}
        <PrimaryButton title={t("send.files.send")} loading={sending} disabled={keep.size === 0} onPress={() => void send()} />
        <TextButton title={t("back")} onPress={() => setConfirming(false)} />
      </Dialog>
    </View>
  );
}
