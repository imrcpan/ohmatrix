import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable } from "react-native";
import { contentText, type TimelineItem } from "@ohmatrix/core";
import { FlatList, Text, View } from "react-native";
import { ActionSheet, Avatar, Bubble, Chip, Dialog, PrimaryButton, ReactionChips, TextButton, Composer, fontFamily, IconButton, useTheme } from "@ohmatrix/ui";
import { useMediaUrl } from "./useMedia.js";
import { useServices, useAppState, useController, useLocale, useT } from "./context.js";
import { formatBytes, formatClock, typingLabel } from "./format.js";
import { buildRows, type Row } from "./timelineRows.js";

const AVATAR = 32;
const MAX_IMAGE = 300;

function UnreadDivider({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginVertical: 8, paddingVertical: 4, backgroundColor: colors.serviceChip, alignItems: "center" }}>
      <Text style={{ fontSize: 13, fontWeight: "600", fontFamily, color: colors.serviceChipText }}>{label}</Text>
    </View>
  );
}

const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;

interface RowActions {
  react(eventId: string, key: string): void;
  reply(item: TimelineItem): void;
  edit(item: TimelineItem): void;
  remove(eventId: string): void;
  jump(eventId: string): void;
  download(file: { url: string; name: string; encryption?: unknown; mimeType?: string }): void;
}

function TimelineRow({ row, isGroup, actions }: { row: Row; isGroup: boolean; actions: RowActions }) {
  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const locale = useLocale();
  const t = useT();
  const m = row.type === "message" ? row.item : undefined;
  const avatar = useMediaUrl(m?.senderAvatar, { width: 64, height: 64, fit: "crop" });
  const content = m?.content;
  const dims = content?.kind === "image" ? fit(content.width, content.height) : undefined;
  const image = useMediaUrl(
    content?.kind === "image" ? content.url : undefined,
    dims
      ? {
          width: dims.width * 2,
          height: dims.height * 2,
          ...(content?.kind === "image" && content.encryption
            ? { encryption: content.encryption, ...(content.mimeType && { mimeType: content.mimeType }) }
            : {}),
        }
      : {},
  );
  if (row.type === "unread") return <UnreadDivider label={t("newMessages")} />;
  if (row.type === "date") return <Chip text={row.label} />;
  if (row.type === "service") return <Chip text={row.text} />;
  if (!m || !content) return null;
  const showAvatar = isGroup && !m.isOwn;
  const open = () => setMenu(true);
  const mineKeys = (m.reactions ?? []).filter((r) => r.mine).map((r) => r.key);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 6,
        paddingHorizontal: 10,
        marginTop: row.first ? 6 : 2,
        justifyContent: m.isOwn ? "flex-end" : "flex-start",
      }}
    >
      {showAvatar && (row.last ? <Avatar id={m.sender} name={m.senderName} size={AVATAR} src={avatar} /> : <View style={{ width: AVATAR }} />)}
      <View style={{ maxWidth: "78%", alignItems: m.isOwn ? "flex-end" : "flex-start" }}>
        <Pressable
          onLongPress={open}
          {...({
            onContextMenu: (e: { preventDefault(): void }) => {
              e.preventDefault();
              open();
            },
          } as object)}
          delayLongPress={350}
        >
          <Bubble
            own={m.isOwn}
            text={content.kind === "image" || content.kind === "file" ? "" : content.kind === "undecryptable" ? t("undecryptable") : contentText(content)}
            time={formatClock(m.ts, locale)}
            status={m.isOwn ? (m.readBy?.length && m.status === "sent" ? "read" : m.status) : undefined}
            readLabel={m.readBy?.length ? t("readBy", { names: m.readBy.map((r) => r.name).join(", ") }) : undefined}
            senderName={showAvatar && row.first ? m.senderName : undefined}
            senderId={m.sender}
            image={dims ? { uri: image, ...dims } : undefined}
            file={content.kind === "file" ? { name: content.name, sizeLabel: formatBytes(content.size), onPress: () => actions.download(content) } : undefined}
            reply={
              m.replyTo && {
                senderName: m.replyTo.senderName,
                senderId: m.replyTo.sender,
                preview: m.replyTo.preview,
                onPress: () => actions.jump(m.replyTo!.id),
              }
            }
            editedLabel={m.edited ? t("edited") : undefined}
            position={{ first: row.first, last: row.last }}
            muted={content.kind === "unsupported" || content.kind === "undecryptable"}
          />
        </Pressable>
        {!!m.reactions?.length && <ReactionChips items={m.reactions} onToggle={(k) => actions.react(m.id, k)} />}
      </View>
      <ActionSheet
        visible={menu}
        onClose={() => setMenu(false)}
        emojis={QUICK_REACTIONS}
        activeEmojis={mineKeys}
        onEmoji={(k) => actions.react(m.id, k)}
        actions={[
          { label: t("reply"), onPress: () => actions.reply(m) },
          ...(m.isOwn && content.kind === "text" ? [{ label: t("edit"), onPress: () => actions.edit(m) }] : []),
          ...(m.isOwn ? [{ label: t("delete"), danger: true, onPress: () => setConfirmDelete(true) }] : []),
        ]}
      />
      <Dialog visible={confirmDelete} title={t("delete.title")} message={t("delete.body")} onClose={() => setConfirmDelete(false)}>
        <PrimaryButton
          title={t("delete")}
          onPress={() => {
            setConfirmDelete(false);
            actions.remove(m.id);
          }}
        />
        <TextButton title={t("cancel")} onPress={() => setConfirmDelete(false)} />
      </Dialog>
    </View>
  );
}

/** Scale to fit MAX_IMAGE on the long edge, keeping aspect; unknown size → square. */
function fit(w?: number, h?: number) {
  if (!w || !h) return { width: MAX_IMAGE, height: MAX_IMAGE };
  const k = Math.min(1, MAX_IMAGE / Math.max(w, h));
  return { width: Math.max(130, Math.round(w * k)), height: Math.max(90, Math.round(h * k)) };
}

export function ChatPane(props: { roomId: string; onBack?: (() => void) | undefined; onInfo?: (() => void) | undefined }) {
  const { colors } = useTheme();
  const t = useT();
  const locale = useLocale();
  const controller = useController();
  const room = useAppState((s) => s.rooms.find((r) => r.id === props.roomId));
  const items = useAppState((s) => s.timelines[props.roomId]);
  const headerAvatar = useMediaUrl(room?.avatar, { width: 76, height: 76, fit: "crop" });
  const handle = useRef<ReturnType<typeof controller.openRoom> | null>(null);
  const [typing, setTyping] = useState<string[]>([]);
  const lastItemId = items?.[items.length - 1]?.id;

  const [unreadFrom, setUnreadFrom] = useState<string | null>(null);
  useEffect(() => {
    const h = controller.openRoom(props.roomId);
    handle.current = h;
    const offTyping = h.onTyping(setTyping);
    setUnreadFrom(h.firstUnreadEventId);
    return () => {
      handle.current = null;
      offTyping();
      setTyping([]);
      h.setTyping(false);
      h.close();
    };
  }, [controller, props.roomId]);

  // Keep the room marked read while it is open and new messages arrive.
  const unread = room?.unreadCount ?? 0;
  useEffect(() => {
    if (unread > 0) void handle.current?.markRead().catch(() => {});
  }, [unread, lastItemId]);

  // Newest first: the list is inverted so the latest message sits at the bottom and history loads upward.
  const rows = useMemo(() => buildRows(items ?? [], Date.now(), locale, unreadFrom).reverse(), [items, locale, lastItemId, unreadFrom]);
  const isGroup = !!room && !room.isDirect;

  const services = useServices();
  const listRef = useRef<FlatList<Row>>(null);
  const [replying, setReplying] = useState<TimelineItem | null>(null);
  const [editing, setEditing] = useState<TimelineItem | null>(null);
  const [prefill, setPrefill] = useState<{ text: string; nonce: number }>();
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const actions = useMemo<RowActions>(
    () => ({
      react: (id, key) => void handle.current?.react(id, key).catch(() => {}),
      reply: (item) => {
        setEditing(null);
        setReplying(item);
      },
      edit: (item) => {
        setReplying(null);
        setEditing(item);
        setPrefill({ text: contentText(item.content), nonce: Date.now() });
      },
      download: (f) =>
        void controller
          .resolveMedia(f.url, { ...(f.encryption ? { encryption: f.encryption } : {}), ...(f.mimeType && { mimeType: f.mimeType }) })
          .then((url) => services.saveFile?.({ url, name: f.name }))
          .catch(() => {}),
      remove: (id) => void handle.current?.redact(id).catch(() => {}),
      jump: (id) => {
        const index = rowsRef.current.findIndex((r) => r.type === "message" && r.item.id === id);
        if (index >= 0) listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
      },
    }),
    [],
  );
  const renderRow = ({ item }: { item: Row }) => <TimelineRow row={item} isGroup={isGroup} actions={actions} />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.chatBg }}>
      <View
        style={{
          height: 56,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 12,
          backgroundColor: colors.bg,
          borderBottomWidth: 1,
          borderBottomColor: colors.separator,
        }}
      >
        {props.onBack && <IconButton icon="back" label="Back" size={26} onPress={props.onBack} />}
        {room && <Avatar id={room.id} name={room.name} size={38} src={headerAvatar} />}
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "600", fontFamily, color: colors.text }}>
            {room?.name ?? ""}
          </Text>
          {room && (
            <Text numberOfLines={1} style={{ fontSize: 13, fontFamily, color: typing.length ? colors.accent : colors.textSecondary }}>
              {typing.length
                ? typingLabel(typing, t, room.isDirect)
                : room.isDirect
                  ? t("directChat")
                  : room.memberCount === 1
                    ? t("member.one")
                    : t("members", { n: room.memberCount })}
            </Text>
          )}
        </View>
        {props.onInfo && <IconButton icon="info" label={t("chatInfo")} size={24} onPress={props.onInfo} />}
      </View>
      <FlatList
        ref={listRef}
        inverted
        onScrollToIndexFailed={({ index, averageItemLength }) => listRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: true })}
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderRow}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: 8 }}
        onEndReachedThreshold={0.6}
        onEndReached={() => void handle.current?.paginateBackwards().catch(() => {})}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={24}
      />
      <Composer
        placeholder={t("message")}
        prefill={prefill}
        onTyping={(on) => handle.current?.setTyping(on)}
        onAttach={
          services.pickFiles
            ? () => void services.pickFiles!().then((files) => files.forEach((f) => handle.current?.sendAttachment(f).catch(() => {})))
            : undefined
        }
        context={
          editing
            ? { kind: "edit", title: t("edit.title"), preview: contentText(editing.content) }
            : replying
              ? { kind: "reply", title: replying.senderName, preview: replying.content.kind === "image" ? t("photo") : contentText(replying.content) }
              : undefined
        }
        onCancelContext={() => {
          setReplying(null);
          setEditing(null);
          setPrefill({ text: "", nonce: Date.now() });
        }}
        onSend={(body) => {
          if (editing) void handle.current?.edit(editing.id, body);
          else if (replying) void handle.current?.reply(replying.id, body);
          else void handle.current?.sendText(body);
          setReplying(null);
          setEditing(null);
        }}
      />
    </View>
  );
}
