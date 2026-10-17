import { useCallback, useRef, useState } from "react";
import { View } from "react-native";
import type { TimelineItem } from "@ohmatrix/core";
import { Composer, TopNotice, useTheme } from "@ohmatrix/ui";
import { ForwardDialog } from "../ForwardDialog.js";
import { useLocale, useT } from "../context.js";
import { formatDayLabel } from "../format.js";
import { useNotice } from "../useNotice.js";
import type { Row } from "../timelineRows.js";
import { AttachmentDialogs } from "./AttachmentDialogs.js";
import { ChatHeader, HEADER_HEIGHT } from "./ChatHeader.js";
import { ChatSearch } from "./ChatSearch.js";
import { MessageList } from "./MessageList.js";
import type { MessageListHandle } from "./messageList.js";
import { DatePill, DropOverlay, LoadingOverlay, ScrollToLatest, Toast, type DatePillControls } from "./overlays.js";
import { TimelineRow } from "./TimelineRow.js";
import { useAttachments } from "./useAttachments.js";
import { useComposer } from "./useComposer.js";
import { useNewWhileAway } from "./useNewWhileAway.js";
import { useReveal } from "./useReveal.js";
import { useBackHandler } from "../useBackHandler.js";
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
  const { room, items, handle, typing, rows: allRows, isGroup } = useRoomTimeline(props.roomId);
  const list = useRef<MessageListHandle | null>(null);
  const datePill = useRef<DatePillControls | null>(null);
  const [ready, setReady] = useState(false);
  // Only the newest screen and a half is drawn at first; see useRowWindow.
  const win = useRowWindow(allRows, ready);
  const rows = win.rows;
  const [searching, setSearching] = useState(false);
  // Back closes the search bar before it leaves the chat.
  useBackHandler(
    searching
      ? () => {
          setSearching(false);
          return true;
        }
      : null,
  );
  const [forwarding, setForwarding] = useState<TimelineItem | null>(null);

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
  const attachments = useAttachments(handle, t);
  const nw = useNewWhileAway(items);
  const notice = useNotice();
  const actions = useRowActions({
    handle,
    startReply: composer.startReply,
    startEdit: composer.startEdit,
    forward: setForwarding,
    jump: (id) => void reveal.reveal(id),
    fail: (message) => notice.show(message, "error"),
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
      <ChatHeader
        room={room}
        typing={typing}
        searching={searching}
        onToggleSearch={() => setSearching((v) => !v)}
        onBack={props.onBack}
        onInfo={props.onInfo}
      />
      {searching && <ChatSearch roomId={props.roomId} onClose={() => setSearching(false)} />}
      {!ready && <LoadingOverlay label={t("chat.loading")} />}
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
      <Composer {...composer.props} {...attachments.composerProps} />
      {attachments.dropping && <DropOverlay label={t("drop.hint")} />}
      {forwarding && <ForwardDialog visible fromRoomId={props.roomId} eventId={forwarding.id} onClose={() => setForwarding(null)} />}
      <AttachmentDialogs a={attachments} />
      {notice.notice && <TopNotice message={notice.notice.message} kind={notice.notice.kind} top={HEADER_HEIGHT + 10} />}
    </View>
  );
}
