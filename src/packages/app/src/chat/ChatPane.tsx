import { useCallback, useMemo, useRef, useState } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";
import { Composer, useTheme } from "@ohmatrix/ui";
import { ForwardDialog } from "../ForwardDialog.js";
import { useLocale, useServices, useT } from "../context.js";
import { formatDayLabel } from "../format.js";
import { useNotice } from "../useNotice.js";
import type { Row } from "../timelineRows.js";
import { AttachmentDialogs } from "./AttachmentDialogs.js";
import { ChatHeader } from "./ChatHeader.js";
import { useBackHandler } from "../useBackHandler.js";
import { PinnedBar } from "./PinnedBar.js";
import { PinnedPage } from "./PinnedPage.js";
import { usePinnedIds } from "./usePinned.js";
import { PinnedContext } from "./pinnedContext.js";
import { SlidePanel } from "../SlidePanel.js";
import { ChatSearch } from "./ChatSearch.js";
import { SelectionBar, SelectionHeader } from "./SelectionBar.js";
import { SelectionContext, type Selection } from "./selection.js";
import { MessageList } from "./MessageList.js";
import type { MessageListHandle } from "./messageList.js";
import { DatePill, DropOverlay, LoadingOverlay, ScrollToLatest, Toast, type DatePillControls } from "./overlays.js";
import { TimelineRow } from "./TimelineRow.js";
import { useAttachments } from "./useAttachments.js";
import { useComposer } from "./useComposer.js";
import { useNewWhileAway } from "./useNewWhileAway.js";
import { useReveal } from "./useReveal.js";
import { useRoomTimeline } from "./useRoomTimeline.js";
import { useRowWindow } from "./useRowWindow.js";
import { useRowActions } from "./useRowActions.js";

interface ChatPaneProps {
  roomId: string;
  onBack?: (() => void) | undefined;
  onInfo?: (() => void) | undefined;
}

/**
 * One chat: header, messages, message box. Everything it is made of lives in the `chat/` folder; this only puts the
 * pieces together. It is keyed by the room, so a different room is a fresh chat with no state carried over.
 */
export function ChatPane(props: ChatPaneProps) {
  return <Chat key={props.roomId} {...props} />;
}

function Chat(props: ChatPaneProps) {
  const { colors } = useTheme();
  const t = useT();
  const locale = useLocale();
  const services = useServices();
  const { room, items, handle, typing, rows: allRows, isGroup } = useRoomTimeline(props.roomId);
  const list = useRef<MessageListHandle | null>(null);
  const datePill = useRef<DatePillControls | null>(null);
  const [ready, setReady] = useState(false);
  // Only the newest screen and a half is drawn at first; see useRowWindow.
  const win = useRowWindow(allRows, ready);
  const rows = win.rows;
  const [searching, setSearching] = useState(false);
  const [pins, setPins] = useState(false);
  const pinnedIds = usePinnedIds(props.roomId);
  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);
  // The platform's back closes the page of pinned messages first, before it leaves the chat.
  useBackHandler(pins ? () => (setPins(false), true) : null);
  // The messages being chosen (to copy or forward), or null when the chat is not choosing.
  const [chosen, setChosen] = useState<ReadonlySet<string> | null>(null);
  // Back closes the choosing, then the search bar, before it leaves the chat.
  useBackHandler(
    chosen
      ? () => {
          setChosen(null);
          return true;
        }
      : searching
        ? () => {
            setSearching(false);
            return true;
          }
        : null,
  );
  const [forwarding, setForwarding] = useState<string[] | null>(null);
  // For each message, the message directly above it (a date or a service line in between means none).
  const neighbours = useMemo(() => {
    const above = new Map<string, string>();
    const below = new Map<string, string>();
    allRows.forEach((r, i) => {
      const before = allRows[i - 1];
      if (r.type === "message" && before?.type === "message") {
        above.set(r.item.id, before.item.id);
        below.set(before.item.id, r.item.id);
      }
    });
    return { above, below };
  }, [allRows]);
  const selection = useMemo<Selection>(
    () => ({
      active: chosen !== null,
      has: (id) => chosen?.has(id) ?? false,
      joinedAbove: (id) => {
        const above = neighbours.above.get(id);
        return !!chosen && chosen.has(id) && above !== undefined && chosen.has(above);
      },
      joinedBelow: (id) => {
        const below = neighbours.below.get(id);
        return !!chosen && chosen.has(id) && below !== undefined && chosen.has(below);
      },
      toggle: (id) =>
        setChosen((c) => {
          if (!c) return c;
          const next = new Set(c);
          if (!next.delete(id)) next.add(id);
          return next;
        }),
    }),
    [chosen, neighbours],
  );
  // The chosen messages, oldest first (the order they are read in, not the order they were tapped).
  const chosenItems = () => allRows.flatMap((r) => (r.type === "message" && chosen?.has(r.item.id) ? [r.item] : []));
  const copyChosen = () => {
    const text = chosenItems()
      .flatMap((m) => (m.content.kind === "text" ? [m.content.body] : []))
      .join("\n");
    setChosen(null);
    if (!text) return;
    const done = () => notice.show(t("copied"));
    if (services.copyText) void services.copyText(text).then(done, () => {});
    else
      void (globalThis as { navigator?: { clipboard?: { writeText(t: string): Promise<void> } } }).navigator?.clipboard?.writeText(text).then(done, () => {});
  };

  // A message that is loaded but not drawn yet is drawn before the list goes to it.
  const revealList = useRef<MessageListHandle | null>({
    scrollToLatest: () => list.current?.scrollToLatest(),
    scrollToRow: (key) => {
      win.grow(key);
      setTimeout(() => list.current?.scrollToRow(key), 60);
    },
  });
  revealList.current = {
    scrollToLatest: () => list.current?.scrollToLatest(),
    scrollToRow: (key) => {
      win.grow(key);
      setTimeout(() => list.current?.scrollToRow(key), 60);
    },
  };
  const reveal = useReveal({ roomId: props.roomId, rows: allRows, items, handle, list: revealList, t });
  const composer = useComposer(props.roomId, handle, t);
  const attachments = useAttachments(handle, t, props.roomId);
  // The platform's back folds the attach panel first, before it leaves the chat.
  useBackHandler(attachments.panel ? () => (attachments.closePanel(), true) : null);
  const nw = useNewWhileAway(items);
  const notice = useNotice();
  const actions = useRowActions({
    handle,
    startReply: composer.startReply,
    startEdit: composer.startEdit,
    forward: (item) => setForwarding([item.id]),
    select: (item) => {
      Keyboard.dismiss();
      (globalThis as { document?: { activeElement?: { blur?: () => void } | null } }).document?.activeElement?.blur?.();
      setChosen(new Set([item.id]));
    },
    jump: (id) => void reveal.reveal(id),
    fail: (message) => notice.show(message, "error"),
    done: (message) => notice.show(message),
  });

  const { highlightId } = reveal;
  const renderRow = useCallback(
    (row: Row) => <TimelineRow row={row} isGroup={isGroup} actions={actions} highlighted={row.type === "message" && row.item.id === highlightId} />,
    [isGroup, actions, highlightId],
  );
  const onVisibleTop = useCallback(
    (row: Row) => {
      const label = row.type === "date" ? row.label : row.type === "message" ? formatDayLabel(row.item.ts, Date.now(), locale) : null;
      if (label) datePill.current?.date(label);
    },
    [locale],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.chatBg }}>
      {chosen ? (
        <SelectionHeader
          count={chosen.size}
          onCancel={() => setChosen(null)}
          onCopy={copyChosen}
          onForward={() => setForwarding(chosenItems().map((m) => m.id))}
        />
      ) : (
        <ChatHeader
          room={room}
          typing={typing}
          searching={searching}
          onToggleSearch={() => setSearching((v) => !v)}
          onBack={props.onBack}
          onInfo={props.onInfo}
        />
      )}
      {!chosen && pinnedIds.length > 0 && <PinnedBar roomId={props.roomId} ids={pinnedIds} onJump={actions.jump} onAll={() => setPins(true)} />}
      {searching && !chosen && <ChatSearch roomId={props.roomId} onClose={() => setSearching(false)} />}
      {!ready && <LoadingOverlay label={t("chat.loading")} />}
      <PinnedContext.Provider value={pinnedSet}>
        <SelectionContext.Provider value={selection}>
          <View style={{ flex: 1 }}>
            <MessageList
              rows={rows}
              loaded={items !== undefined}
              renderRow={renderRow}
              onReachedStart={() => {
                // Older rows that are loaded but not drawn come first; the server is asked only when there are none.
                if (win.grow()) return;
                void handle.current?.paginateBackwards().catch(() => {});
              }}
              onReady={() => setReady(true)}
              onPinnedChange={nw.onPinnedChange}
              onAwayChange={nw.onAwayChange}
              onMoving={() => datePill.current?.moving()}
              onVisibleTop={onVisibleTop}
              handleRef={list}
            />
            {/* While the attach panel is open, a tap anywhere on the chat closes it (and does nothing else). */}
            {attachments.panel && (
              <Pressable accessibilityLabel={t("attach.label")} onPress={attachments.closePanel} style={[StyleSheet.absoluteFill, { zIndex: 3 }]} />
            )}
          </View>
        </SelectionContext.Provider>
      </PinnedContext.Provider>
      <DatePill controls={datePill} label={t("date.current")} />
      {reveal.toast && <Toast text={reveal.toast.text} />}
      {nw.away && (
        <ScrollToLatest
          label={t("scroll.latest")}
          countLabel={t("scroll.newCount", { n: nw.count })}
          count={nw.count}
          onPress={() => {
            nw.reset();
            list.current?.scrollToLatest();
          }}
        />
      )}
      {chosen ? (
        <SelectionBar count={chosen.size} />
      ) : (
        <Composer {...composer.props} {...attachments.composerProps} emojiOpen={attachments.emoji.open} onEmojiOpenChange={attachments.emoji.onChange} />
      )}
      {attachments.dropping && <DropOverlay label={t("drop.hint")} />}
      {forwarding && (
        <ForwardDialog visible fromRoomId={props.roomId} eventIds={forwarding} onClose={() => setForwarding(null)} onSent={() => setChosen(null)} />
      )}
      <AttachmentDialogs a={attachments} />
      {/* All the pinned messages, over the chat, from the right. Kept mounted only while open or sliding out. */}
      <SlidePanel mode="overlay" open={pins && pinnedIds.length > 0}>
        <PinnedPage
          roomId={props.roomId}
          ids={pinnedIds}
          backLabel={room?.name ?? t("close")}
          onBack={() => setPins(false)}
          onOpen={(id) => {
            setPins(false);
            actions.jump(id);
          }}
        />
      </SlidePanel>
    </View>
  );
}
