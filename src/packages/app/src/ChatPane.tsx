import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable } from "react-native";
import { contentText, type AttachmentSource, type TimelineItem } from "@ohmatrix/core";
import { FlatList, ScrollView, Text, View } from "react-native";
import {
  parseFormatted,
  plainRuns,
  useRecentEmoji,
  ImageViewer,
  VideoViewer,
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
  Icon,
  IconButton,
  useTheme,
} from "@ohmatrix/ui";
import type { MenuPoint, Run } from "@ohmatrix/ui";
import { SendFilesDialog } from "./SendFilesDialog.js";
import { ForwardDialog } from "./ForwardDialog.js";
import { MessageResults } from "./MessageResults.js";
import { formatDuration, useAudioPlayer } from "./useAudio.js";
import { useVoiceRecording, VideoRecorderDialog } from "./Recording.js";
import { useMentionSuggest } from "./useMentions.js";
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
  pin(item: TimelineItem, pinned: boolean): void;
  forward(item: TimelineItem): void;
  reply(item: TimelineItem): void;
  edit(item: TimelineItem): void;
  remove(eventId: string): void;
  jump(eventId: string): void;
  cancelUpload(id: string): void;
  download(file: { url: string; name: string; encryption?: unknown; mimeType?: string }): void;
}

function TimelineRow({ row, isGroup, actions, highlighted }: { row: Row; isGroup: boolean; actions: RowActions; highlighted?: boolean }) {
  const [menu, setMenu] = useState<MenuPoint | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const locale = useLocale();
  const t = useT();
  const controller = useController();
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
  const [viewing, setViewing] = useState(false);
  const [viewingVideo, setViewingVideo] = useState(false);
  // Link previews: at most two, with their thumbnails resolved (and decrypted in encrypted rooms).
  const previewList = content?.kind === "text" ? (content.previews ?? []).slice(0, 2) : [];
  const previewImage = useMediaUrl(previewList.find((p) => p.image)?.image, { width: 400, height: 400, fit: "crop" });
  const services = useServices();
  // Rich text: a formatted_body is parsed into safe runs; a plain body still gets links and mention pills.
  const runs: readonly Run[] | undefined =
    content?.kind === "text" ? (content.formattedBody ? parseFormatted(content.formattedBody) : plainRuns(content.body, content.mentions)) : undefined;
  const encOf = (c: typeof content) =>
    c && "encryption" in c && c.encryption ? { encryption: c.encryption, ...("mimeType" in c && c.mimeType ? { mimeType: c.mimeType } : {}) } : {};
  // Audio is fetched when play is pressed; video when its player is opened; posters are small and load at once.
  const audio = useAudioPlayer(
    () => (content?.kind === "audio" ? controller.resolveMedia(content.url, encOf(content)) : Promise.reject(new Error("not audio"))),
    content?.kind === "audio" ? content.durationMs : undefined,
  );
  const videoDims = content?.kind === "video" ? fit(content.width ?? 640, content.height ?? 360) : undefined;
  const poster = useMediaUrl(
    content?.kind === "video" ? content.thumbnail?.url : undefined,
    content?.kind === "video" && content.thumbnail
      ? {
          width: 400,
          height: 400,
          ...(content.thumbnail.encryption ? { encryption: content.thumbnail.encryption, mimeType: content.thumbnail.mimeType ?? "image/jpeg" } : {}),
        }
      : {},
  );
  const videoFile = useMediaUrl(viewingVideo && content?.kind === "video" ? content.url : undefined, encOf(content));
  // The sharp original is only fetched once the photo is opened.
  const original = useMediaUrl(
    viewing && content?.kind === "image" ? content.url : undefined,
    content?.kind === "image" && content.encryption ? { encryption: content.encryption, ...(content.mimeType && { mimeType: content.mimeType }) } : {},
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
            text={
              content.kind === "image" || content.kind === "file" || content.kind === "video" || content.kind === "audio"
                ? ""
                : content.kind === "undecryptable"
                  ? t("undecryptable")
                  : contentText(content)
            }
            time={formatClock(m.ts, locale)}
            status={m.isOwn ? (m.readBy?.length && m.status === "sent" ? "read" : m.status) : undefined}
            readLabel={m.readBy?.length ? t("readBy", { names: m.readBy.map((r) => r.name).join(", ") }) : undefined}
            senderName={showAvatar && row.first ? m.senderName : undefined}
            senderId={m.sender}
            image={dims ? { uri: m.upload?.previewUrl ?? image, ...dims, onPress: m.upload ? undefined : () => setViewing(true) } : undefined}
            video={
              videoDims && content.kind === "video"
                ? {
                    posterUri: m.upload?.previewUrl ?? poster,
                    ...videoDims,
                    durationLabel: formatDuration(content.durationMs) || undefined,
                    onPress: () => setViewingVideo(true),
                  }
                : undefined
            }
            audio={
              content.kind === "audio"
                ? {
                    voice: !!content.voice,
                    name: content.name,
                    samples: content.waveform,
                    progress: audio.state.progress,
                    playing: audio.state.status === "playing",
                    loading: audio.state.status === "loading",
                    timeLabel:
                      audio.state.status === "idle"
                        ? formatDuration(audio.state.durationMs)
                        : `${formatDuration(audio.state.positionMs)} / ${formatDuration(audio.state.durationMs)}`,
                    playLabel: audio.state.status === "playing" ? t("pause") : t("play"),
                    onToggle: () => void audio.toggle(),
                    onSeek: (f) => void audio.seek(f),
                  }
                : undefined
            }
            upload={
              m.upload
                ? {
                    progress: m.upload.progress,
                    failed: m.upload.failed,
                    cancelLabel: t(m.upload.failed ? "upload.dismiss" : "upload.cancel"),
                    label: m.upload.failed ? t("upload.failed") : `${formatBytes(m.upload.loaded)} / ${formatBytes(m.upload.total)}`,
                    onCancel: () => actions.cancelUpload(m.transactionId ?? ""),
                  }
                : undefined
            }
            file={content.kind === "file" ? { name: content.name, sizeLabel: formatBytes(content.size), onPress: () => actions.download(content) } : undefined}
            reply={
              m.replyTo && {
                senderName: m.replyTo.senderName,
                senderId: m.replyTo.sender,
                preview: m.replyTo.preview,
                onPress: () => actions.jump(m.replyTo!.id),
              }
            }
            runs={runs}
            previews={previewList.map((p, i) => ({
              key: `${p.url}-${i}`,
              url: p.url,
              title: p.title,
              description: p.description,
              siteName: p.siteName,
              image: p.image === previewList.find((q) => q.image)?.image ? previewImage : undefined,
              imageWidth: p.imageWidth,
              imageHeight: p.imageHeight,
            }))}
            onOpenLink={(url) => services.openLink?.(url)}
            onLink={(href) => services.openLink?.(href)}
            mentionsMe={content.kind === "text" && content.mentionsMe}
            pinned={m.pinned}
            editedLabel={m.edited ? t("edited") : undefined}
            position={{ first: row.first, last: row.last }}
            muted={content.kind === "unsupported" || content.kind === "undecryptable"}
          />
        </Pressable>
        {!!m.reactions?.length && <ReactionChips items={m.reactions} own={m.isOwn} onToggle={(k) => actions.react(m.id, k)} />}
      </View>
      {content.kind === "image" && (
        <ImageViewer
          visible={viewing}
          onClose={() => setViewing(false)}
          title={content.body}
          uri={original}
          previewUri={image}
          width={content.width}
          height={content.height}
          labels={{ close: t("viewer.close"), zoomIn: t("viewer.zoomIn"), zoomOut: t("viewer.zoomOut"), fit: t("viewer.fit") }}
        />
      )}
      {content.kind === "video" && (
        <VideoViewer
          visible={viewingVideo}
          onClose={() => setViewingVideo(false)}
          uri={videoFile}
          poster={poster}
          width={content.width}
          height={content.height}
          closeLabel={t("viewer.close")}
        />
      )}
      <MessageMenu
        visible={!!menu}
        anchor={menu}
        onClose={() => setMenu(null)}
        emojis={QUICK_REACTIONS}
        activeEmojis={mineKeys}
        onEmoji={(k) => actions.react(m.id, k)}
        actions={[
          { label: t("reply"), icon: "reply" as const, onPress: () => actions.reply(m) },
          { label: t("forward"), icon: "forward" as const, onPress: () => actions.forward(m) },
          { label: t(m.pinned ? "unpin" : "pin"), icon: "pin" as const, onPress: () => actions.pin(m, !m.pinned) },
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

  // Oldest first, the way the page reads. (An `inverted` list flips the whole scroller upside down, and the web
  // implementation then cancels every wheel event to turn it back: that loses the browser's own smooth and
  // momentum scrolling. Staying at the bottom is done by hand below instead.)
  const rows = useMemo(() => buildRows(items ?? [], Date.now(), locale, unreadFrom), [items, locale, lastItemId, unreadFrom]);
  const isGroup = !!room && !room.isDirect;

  const services = useServices();
  const listRef = useRef<FlatList<Row>>(null);
  // Scroll bookkeeping. `pinned`: the view is at the bottom, so it follows new messages and late layout.
  const scroll = useRef({ offset: 0, content: 0, view: 0, pinned: true, firstKey: "" as string, own: 0 });
  const [shown, setShown] = useState(false); // hidden until the first jump to the newest message, so the oldest rows never flash
  const BOTTOM_SLACK = 48;
  // The list's scrollToEnd only knows an estimate for rows it has not measured yet, so it can stop well short of the
  // end. On the web the scroller node has the exact height; elsewhere fall back to the list's own method.
  const toBottom = () => {
    const node = (listRef.current as unknown as { getScrollableNode?: () => { scrollTop: number; scrollHeight: number } } | null)?.getScrollableNode?.();
    scroll.current.own = Date.now();
    if (node && typeof node.scrollHeight === "number") node.scrollTop = node.scrollHeight;
    else listRef.current?.scrollToEnd({ animated: false });
  };
  useEffect(() => {
    // A chat with nothing in it never changes size, so there is no first jump to wait for.
    if (!shown && items && rows.length === 0) setShown(true);
  }, [items, rows.length, shown]);
  const [replying, setReplying] = useState<TimelineItem | null>(null);
  const [editing, setEditing] = useState<TimelineItem | null>(null);
  const [prefill, setPrefill] = useState<{ text: string; nonce: number; caret?: number }>();
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [forwarding, setForwarding] = useState<TimelineItem | null>(null);
  const [draft, setDraft] = useState("");
  const [caret, setCaret] = useState(0);
  const mention = useMentionSuggest(controller, props.roomId, draft, caret);
  const { recent, remember } = useRecentEmoji();
  const sendFile = useCallback((f: AttachmentSource) => handle.current?.sendAttachment(f).catch(() => {}) ?? Promise.resolve(), []);
  const [dropping, setDropping] = useState(false);
  const [pending, setPending] = useState<AttachmentSource[]>([]);
  useEffect(() => services.receiveFiles?.((files) => setPending((p) => [...p, ...files]), setDropping), [services]);
  useEffect(() => setPending([]), [props.roomId]);
  const voice = useVoiceRecording(sendFile, services, t);
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
      pin: (item, pinned) => void handle.current?.pin(item.id, pinned).catch(() => {}),
      forward: (item) => setForwarding(item),
      download: (f) =>
        void controller
          .resolveMedia(f.url, { ...(f.encryption ? { encryption: f.encryption } : {}), ...(f.mimeType && { mimeType: f.mimeType }) })
          .then((url) => services.saveFile?.({ url, name: f.name }))
          .catch(() => {}),
      remove: (id) => void handle.current?.redact(id).catch(() => {}),
      cancelUpload: (id) => handle.current?.cancelUpload(id),
      jump: (id) => {
        const index = rowsRef.current.findIndex((r) => r.type === "message" && r.item.id === id);
        if (index >= 0) listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
      },
    }),
    [setForwarding],
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
    scroll.current = { offset: 0, content: 0, view: 0, pinned: true, firstKey: "", own: 0 };
    setShown(false);
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
    scroll.current.pinned = false;
    setHighlightId(focus.eventId);
    const jumpTo = (tries: number) => {
      try {
        listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
      } catch {
        if (tries > 0) setTimeout(() => jumpTo(tries - 1), 250);
      }
    };
    setTimeout(() => jumpTo(4), 50);
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
        {/* Avatar, name and member count open the chat info, exactly like the info button. Only that small block is
            clickable (not the whole title bar), with no background feedback: the name just dims while pressed. */}
        <Pressable
          accessibilityRole={props.onInfo ? "button" : undefined}
          disabled={!props.onInfo}
          onPress={props.onInfo}
          style={{ flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 }}
        >
          {({ pressed }: { pressed: boolean }) => (
            <>
              {room && <Avatar id={room.id} name={room.name} size={38} src={headerAvatar} />}
              <View style={{ flexShrink: 1 }}>
                <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "600", fontFamily, color: colors.text, opacity: props.onInfo && pressed ? 0.5 : 1 }}>
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
            </>
          )}
        </Pressable>
        <View style={{ flex: 1 }} />
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
        onScrollToIndexFailed={({ index, averageItemLength }) => listRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: true })}
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderRow}
        style={{ flex: 1, opacity: shown ? 1 : 0 }}
        contentContainerStyle={{ paddingVertical: 8 }}
        // Older history is fetched as the top comes into view.
        onStartReachedThreshold={0.6}
        onStartReached={() => void handle.current?.paginateBackwards().catch(() => {})}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={24}
        scrollEventThrottle={16}
        onLayout={(e) => {
          scroll.current.view = e.nativeEvent.layout.height;
        }}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const sc = scroll.current;
          sc.offset = contentOffset.y;
          sc.content = contentSize.height;
          sc.view = layoutMeasurement.height;
          const atBottom = contentSize.height - layoutMeasurement.height - contentOffset.y < BOTTOM_SLACK;
          // The content grows in steps as rows are measured, and a step can arrive before our own jump to the new
          // end has settled: that is not the reader leaving the bottom. Only a scroll we did not cause unpins.
          if (atBottom) sc.pinned = true;
          else if (Date.now() - sc.own > 250) sc.pinned = false;
        }}
        onContentSizeChange={(_w, h) => {
          const sc = scroll.current;
          const grew = h - sc.content;
          const first = rowsRef.current[0]?.key ?? "";
          const prepended = !!sc.firstKey && first !== sc.firstKey && grew > 0;
          sc.content = h;
          sc.firstKey = first;
          if (sc.pinned) {
            // At the bottom: stay there as messages arrive and rows settle to their real height.
            toBottom();
            if (!shown && rowsRef.current.length > 0) requestAnimationFrame(() => setShown(true));
          } else if (prepended) {
            // Older rows appeared above the viewport: move down by exactly what was added, so nothing jumps.
            listRef.current?.scrollToOffset({ offset: sc.offset + grew, animated: false });
            sc.offset += grew;
          }
        }}
      />
      <Composer
        placeholder={t("message")}
        prefill={prefill}
        notice={voice.notice}
        recording={voice.bar}
        record={
          services.recordMedia
            ? { onVoice: () => void voice.start(), onVideo: () => setRecordingVideo(true), voiceLabel: t("record.voice"), videoLabel: t("record.video") }
            : undefined
        }
        onTyping={(on) => handle.current?.setTyping(on)}
        onChangeText={setDraft}
        onCaretChange={setCaret}
        suggestionAt={mention.token?.start}
        suggestions={mention.suggestions}
        onPickSuggestion={(s) => {
          const next = mention.apply(s, draft, caret);
          const at = mention.token ? mention.token.start + 1 + s.name.length + 1 : next.length; // just after "@name "
          setDraft(next);
          setCaret(at);
          setPrefill({ text: next, nonce: Date.now(), caret: at });
        }}
        onEmoji={remember}
        emojiLabel={t("emoji")}
        emojiSearchLabel={t("emoji.search")}
        mentionLabel={t("mention.suggest")}
        mentionTitle={t("mention.title")}
        menuTopLimit={56}
        onDismissSuggestions={mention.dismiss}
        recentEmoji={recent}
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
          const ids = mention.resolve(body);
          if (editing) void handle.current?.edit(editing.id, body);
          else if (replying) void handle.current?.reply(replying.id, body, ids);
          else void handle.current?.sendText(body, ids);
          setDraft("");
          setCaret(0);
          mention.reset();
          setReplying(null);
          setEditing(null);
        }}
      />
      {dropping && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 6,
            margin: 10,
            borderRadius: 16,
            borderWidth: 2,
            borderStyle: "dashed",
            borderColor: colors.accent,
            backgroundColor: colors.overlay,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="attach" size={40} color={colors.accent} />
          <Text style={{ marginTop: 10, fontSize: 17, fontWeight: "600", fontFamily, color: colors.text }}>{t("drop.hint")}</Text>
        </View>
      )}
      {forwarding && <ForwardDialog visible fromRoomId={props.roomId} eventId={forwarding.id} onClose={() => setForwarding(null)} />}
      <SendFilesDialog
        files={pending}
        onCancel={() => setPending([])}
        onSend={() => {
          pending.forEach((f) => void sendFile(f));
          setPending([]);
        }}
      />
      <VideoRecorderDialog visible={recordingVideo} onClose={() => setRecordingVideo(false)} send={sendFile} />
    </View>
  );
}
