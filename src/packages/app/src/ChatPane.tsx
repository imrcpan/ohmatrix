import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable } from "react-native";
import { contentText, type TimelineItem } from "@ohmatrix/core";
import { FlatList, ScrollView, Text, View } from "react-native";
import {
  MessageMenu,
  Avatar,
  Bubble,
  Chip,
  Dialog,
  PrimaryButton,
  ReactionChips,
  SearchField,
  TextButton,
  Composer,
  fontFamily,
  IconButton,
  useTheme,
} from "@ohmatrix/ui";
import type { MenuPoint } from "@ohmatrix/ui";
import { MessageResults } from "./MessageResults.js";
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

function TimelineRow({ row, isGroup, actions, highlighted }: { row: Row; isGroup: boolean; actions: RowActions; highlighted?: boolean }) {
  const [menu, setMenu] = useState<MenuPoint | null>(null);
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
  const open = (x: number, y: number) => setMenu({ x, y });
  const mineKeys = (m.reactions ?? []).filter((r) => r.mine).map((r) => r.key);
  return (
    <View
      accessibilityLabel={highlighted ? "Found message" : undefined}
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: highlighted ? 4 : 0,
        marginTop: row.first ? 6 : 2,
        justifyContent: m.isOwn ? "flex-end" : "flex-start",
        backgroundColor: highlighted ? "rgba(51,144,236,0.22)" : "transparent",
      }}
    >
      {showAvatar && (row.last ? <Avatar id={m.sender} name={m.senderName} size={AVATAR} src={avatar} /> : <View style={{ width: AVATAR }} />)}
      <View style={{ maxWidth: "78%", alignItems: m.isOwn ? "flex-end" : "flex-start" }}>
        {/* The bubble opens the context menu but is read, not clicked: show the text cursor, not the hand (nested buttons such as quotes and files keep theirs). */}
        <Pressable
          style={{ cursor: "text" } as object}
          onLongPress={(e) => {
            const n = e.nativeEvent as { pageX?: number; pageY?: number };
            open(n.pageX ?? 0, n.pageY ?? 0);
          }}
          delayLongPress={350}
          {...({
            onContextMenu: (e: { preventDefault(): void; clientX: number; clientY: number }) => {
              e.preventDefault();
              open(e.clientX, e.clientY);
            },
          } as object)}
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
        {!!m.reactions?.length && <ReactionChips items={m.reactions} own={m.isOwn} onToggle={(k) => actions.react(m.id, k)} />}
      </View>
      <MessageMenu
        visible={!!menu}
        anchor={menu}
        onClose={() => setMenu(null)}
        emojis={QUICK_REACTIONS}
        activeEmojis={mineKeys}
        onEmoji={(k) => actions.react(m.id, k)}
        actions={[
          { label: t("reply"), icon: "reply" as const, onPress: () => actions.reply(m) },
          ...(m.isOwn && content.kind === "text" ? [{ label: t("edit"), icon: "edit" as const, onPress: () => actions.edit(m) }] : []),
          ...(m.isOwn ? [{ label: t("delete"), icon: "trash" as const, danger: true, onPress: () => setConfirmDelete(true) }] : []),
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
  const renderRow = ({ item }: { item: Row }) => (
    <TimelineRow row={item} isGroup={isGroup} actions={actions} highlighted={item.type === "message" && item.item.id === highlightId} />
  );

  // Search: a header button opens a results list for this chat; picking a result scrolls to the message.
  const [searching, setSearching] = useState(false);
  const [term, setTerm] = useState("");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const focus = useAppState((s) => s.focusEvent);
  const paginations = useRef(0);
  useEffect(() => {
    paginations.current = 0;
    setSearching(false);
    setTerm("");
  }, [props.roomId]);
  useEffect(() => {
    if (!focus || focus.roomId !== props.roomId || !items) return;
    const index = rows.findIndex((r) => r.type === "message" && r.item.id === focus.eventId);
    if (index < 0) {
      // Not loaded yet: fetch older history a page at a time (bounded), the effect runs again as it arrives.
      if (paginations.current++ < 12) void handle.current?.paginateBackwards().catch(() => {});
      else controller.clearFocusEvent();
      return;
    }
    controller.clearFocusEvent();
    setHighlightId(focus.eventId);
    const scroll = (tries: number) => {
      try {
        listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
      } catch {
        if (tries > 0) setTimeout(() => scroll(tries - 1), 250);
      }
    };
    setTimeout(() => scroll(4), 50);
    setTimeout(() => setHighlightId((cur) => (cur === focus.eventId ? null : cur)), 3000);
  }, [focus, items, rows, props.roomId]);

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
        <IconButton
          icon="search"
          label={t("search.inChat")}
          size={22}
          color={searching ? colors.accent : colors.textSecondary}
          onPress={() => {
            setSearching((v) => !v);
            setTerm("");
          }}
        />
        {props.onInfo && <IconButton icon="info" label={t("chatInfo")} size={24} onPress={props.onInfo} />}
      </View>
      {searching && (
        <View
          accessibilityLabel={t("search.inChat")}
          style={{ position: "absolute", top: 56, left: 0, right: 0, bottom: 0, zIndex: 4, backgroundColor: colors.bg }}
        >
          <View style={{ padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <SearchField value={term} onChangeText={setTerm} placeholder={t("search.inChat")} autoFocus />
            </View>
            <IconButton
              icon="close"
              label={t("search.close")}
              size={20}
              color={colors.textSecondary}
              onPress={() => {
                setSearching(false);
                setTerm("");
              }}
            />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <MessageResults
              term={term}
              roomId={props.roomId}
              showRoom={false}
              onPick={(r) => {
                setSearching(false);
                setTerm("");
                controller.openMessage(r.roomId, r.eventId);
              }}
            />
          </ScrollView>
        </View>
      )}
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
