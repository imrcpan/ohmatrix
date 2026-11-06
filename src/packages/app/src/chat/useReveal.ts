import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { TimelineItem } from "@ohmatrix/core";
import type { OpenRoom } from "@ohmatrix/state";
import { useAppState, useController } from "../context.js";
import type { Row } from "../timelineRows.js";
import { loadUntil } from "./loadUntil.js";
import type { MessageListHandle } from "./messageListTypes.js";
import type { Translate } from "./types.js";
import { useLatest } from "./useLatest.js";

const HIGHLIGHT_MS = 3000;

/**
 * Go to a message and highlight it, reading older history first when it is not loaded. Used by search results (which
 * arrive as the app's "focus event") and by a reply's quote. Says so when the message cannot be found.
 */
export function useReveal(opts: {
  roomId: string;
  rows: Row[];
  items: TimelineItem[] | undefined;
  handle: { readonly current: OpenRoom | null };
  list: MutableRefObject<MessageListHandle | null>;
  t: Translate;
}) {
  const controller = useController();
  const focus = useAppState((s) => s.focusEvent);
  const latest = useLatest(opts);
  const [toast, setToast] = useState<{ text: string; busy?: boolean } | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!toast || toast.busy) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const reveal = async (eventId: string) => {
    if (busy.current) return;
    busy.current = true;
    const rowOf = () => latest.current.rows.find((r) => r.type === "message" && r.item.id === eventId);
    try {
      if (!rowOf()) {
        setToast({ text: latest.current.t("jump.looking"), busy: true });
        await loadUntil({
          has: () => !!rowOf(),
          paginate: async () => void (await latest.current.handle.current?.paginateBackwards().catch(() => {})),
          count: () => latest.current.items?.length ?? 0,
        });
      }
      const row = rowOf();
      if (!row) {
        setToast({ text: latest.current.t("jump.notFound") });
        return;
      }
      setToast(null);
      setHighlightId(eventId);
      latest.current.list.current?.scrollToRow(row.key);
      setTimeout(() => setHighlightId((cur) => (cur === eventId ? null : cur)), HIGHLIGHT_MS);
    } finally {
      busy.current = false;
    }
  };
  const revealRef = useLatest(reveal);

  useEffect(() => {
    if (!focus || focus.roomId !== opts.roomId || !opts.items) return;
    controller.clearFocusEvent();
    void revealRef.current(focus.eventId);
  }, [focus, opts.items, opts.roomId, controller, revealRef]);

  return { reveal, toast, highlightId };
}
