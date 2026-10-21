import { useEffect, useMemo, useRef, useState } from "react";
import { spreadReceipts } from "@ohmatrix/core";
import type { OpenRoom } from "@ohmatrix/state";
import { useAppState, useController, useLocale } from "../context.js";
import { buildRows } from "../timelineRows.js";

/**
 * An open room: its handle (released when the chat closes), its messages, who is typing, and the rows to draw.
 * The room is also kept marked read while it is open and new messages arrive.
 */
export function useRoomTimeline(roomId: string) {
  const controller = useController();
  const locale = useLocale();
  const room = useAppState((s) => s.rooms.find((r) => r.id === roomId));
  const items = useAppState((s) => s.timelines[roomId]);
  const handle = useRef<OpenRoom | null>(null);
  const [typing, setTyping] = useState<string[]>([]);
  const [unreadFrom, setUnreadFrom] = useState<string | null>(null);
  const lastItemId = items?.[items.length - 1]?.id;

  useEffect(() => {
    const h = controller.openRoom(roomId);
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
  }, [controller, roomId]);

  const unread = room?.unreadCount ?? 0;
  useEffect(() => {
    if (unread > 0) void handle.current?.markRead().catch(() => {});
  }, [unread, lastItemId]);

  // Oldest first, the way the list is given to a message list (which decides for itself how to lay it out).
  const rows = useMemo(() => buildRows(spreadReceipts(items ?? []), Date.now(), locale, unreadFrom), [items, locale, unreadFrom]);
  return { room, items, handle, typing, rows, isGroup: !!room && !room.isDirect, lastItemId };
}
