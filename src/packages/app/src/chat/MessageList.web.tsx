import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, View } from "react-native";
import type { Row } from "../timelineRows.js";
import type { MessageListProps } from "./messageList.js";
import { gapToBottom, isAtBottom, isAway, needsFill, offsetAfterPrepend } from "./scrollMath.js";
import { useTheme } from "@ohmatrix/ui";
import { ChatSkeleton } from "./ChatSkeleton.js";
import { OLDER_SKELETON, OLDER_SKELETON_HEIGHT } from "./olderSkeleton.js";
import { useLatest } from "./useLatest.js";

/** The few parts of the DOM this file touches (the app's TypeScript has no DOM library). */
interface Listenable {
  addEventListener(type: string, fn: (e: never) => void, opts?: { passive?: boolean }): void;
  removeEventListener(type: string, fn: (e: never) => void): void;
}
interface KeyLike {
  key: string;
  target: { tagName?: string; isContentEditable?: boolean } | null;
}

/** What the browser gives for the list's scroller. */
interface ScrollNode {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  getBoundingClientRect(): { top: number; bottom: number };
  scrollBy?(o: { top: number }): void;
}

/** How long the content must stay unchanged before the list is shown (the window is small, so it is measured at once), and how long to wait before showing it anyway. */
const SETTLE_MS = 80;
const GIVE_UP_MS = 10_000;

/**
 * The web message list: rows in reading order (oldest first) in an ordinary scroller, so the browser's own wheel,
 * momentum, keyboard, selection and find-in-page all work. What an inverted list gets for free is done here:
 * staying at the bottom while rows arrive and are measured, and keeping the view still when older rows appear above.
 */
export function MessageList(props: MessageListProps) {
  const p = useLatest(props);
  const { colors } = useTheme();
  const listRef = useRef<FlatList<Row>>(null);
  const s = useRef({ offset: 0, content: 0, view: 0, pinned: true, firstKey: "", filledFor: -1 });
  const [ready, setReady] = useState(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const node = useCallback(
    (): ScrollNode | null => (listRef.current as unknown as { getScrollableNode?: () => ScrollNode } | null)?.getScrollableNode?.() ?? null,
    [],
  );
  /** Move the view to `top` (within the scroller's range). */
  const moveTo = useCallback(
    (top: number) => {
      const n = node();
      if (!n) return;
      const to = Math.max(0, Math.min(top, n.scrollHeight - n.clientHeight));
      n.scrollTop = to;
    },
    [node],
  );
  const toBottom = useCallback(() => {
    const n = node();
    if (n) moveTo(n.scrollHeight);
    else listRef.current?.scrollToEnd({ animated: false });
  }, [node, moveTo]);

  // Whether the reader is the one scrolling. Scroll events also come from our own jumps and from the browser adjusting
  // for rows that change height, and neither means the reader left the bottom; only a scroll while they are using the
  // wheel, a finger, the keyboard or the scrollbar does. (Watching the input is what tells them apart; guessing from
  // the scroll event, or from "a moment since our last jump", mistakes one for the other.)
  // While we are bringing a row into view the view starts out near the bottom, and must not be taken for "back at the
  // bottom" (which would pin it there and undo the jump): this holds the list off the bottom until the jump is over.
  const jumping = useRef(false);
  const lastInput = useRef(0);
  const dragging = useRef(false);
  const userScrolling = () => dragging.current || Date.now() - lastInput.current < 800;
  useEffect(() => {
    let off: (() => void) | undefined;
    let tries = 0;
    const attach = () => {
      const el = node() as unknown as Listenable | null;
      const doc = (globalThis as { document?: Listenable }).document;
      if (!el || !doc) {
        if (tries++ < 20) timer = setTimeout(attach, 50);
        return;
      }
      const touch = () => void (lastInput.current = Date.now());
      const key = (e: KeyLike) => {
        const typing = e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA" || e.target?.isContentEditable;
        if (!typing && ["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " "].includes(e.key)) touch();
      };
      const down = () => {
        dragging.current = true; // a press on the scroller (its scrollbar) until released
        touch();
      };
      const up = () => {
        // Only ends a drag that began on the scroller. Releasing the mouse anywhere else (a click on the "latest"
        // button, say) is not scrolling and must not count as input.
        dragging.current = false;
      };
      el.addEventListener("wheel", touch, { passive: true });
      el.addEventListener("touchmove", touch, { passive: true });
      el.addEventListener("pointerdown", down);
      doc.addEventListener("pointerup", up);
      doc.addEventListener("keydown", key);
      off = () => {
        el.removeEventListener("wheel", touch);
        el.removeEventListener("touchmove", touch);
        el.removeEventListener("pointerdown", down);
        doc.removeEventListener("pointerup", up);
        doc.removeEventListener("keydown", key);
      };
    };
    let timer = setTimeout(attach, 0);
    return () => {
      clearTimeout(timer);
      off?.();
    };
  }, [node]);

  // Shown only once the content has stopped changing for a moment: it fills in row by row, jumping to the end each
  // time, and the reader should not see that.
  const settleSoon = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => setReady(true), SETTLE_MS);
  };
  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );
  useEffect(() => {
    // A room with nothing in it never changes size, so there is no first jump to wait for.
    if (!ready && props.loaded && props.rows.length === 0) setReady(true);
  }, [ready, props.loaded, props.rows.length]);
  useEffect(() => {
    if (ready) return;
    const timer = setTimeout(() => setReady(true), GIVE_UP_MS); // never wait for ever
    return () => clearTimeout(timer);
  }, [ready]);
  useEffect(() => {
    if (ready) p.current.onReady();
  }, [ready, p]);

  // The chat's handle on the list.
  useEffect(() => {
    props.handleRef.current = {
      scrollToLatest: () => {
        jumping.current = false;
        s.current.pinned = true;
        p.current.onPinnedChange(true);
        toBottom();
      },
      scrollToRow: (key) => {
        s.current.pinned = false;
        jumping.current = true;
        p.current.onPinnedChange(false);
        const indexOf = () => p.current.rows.findIndex((r) => r.key === key);
        // A row far from the loaded window is placed by an estimate until the rows around it are drawn and measured,
        // which moves it afterwards. So keep correcting for a moment: by its real position once it exists, by index
        // until then, and stop when it sits near the middle and has stayed there.
        const find = () => {
          const doc = (
            globalThis as {
              document?: {
                querySelectorAll(sel: string): ArrayLike<{ getAttribute(n: string): string | null; getBoundingClientRect(): { top: number; bottom: number } }>;
              };
            }
          ).document;
          return Array.from(doc?.querySelectorAll("[data-row-key]") ?? []).find((el) => el.getAttribute("data-row-key") === key) ?? null;
        };
        let passes = 0;
        const settle = () => {
          const el = find();
          const n = node();
          if (el && n) {
            const r = el.getBoundingClientRect();
            const v = n.getBoundingClientRect();
            const off = (r.top + r.bottom) / 2 - (v.top + v.bottom) / 2;
            if (Math.abs(off) > Math.max(40, (v.bottom - v.top) * 0.25)) moveTo(n.scrollTop + off);
            else if (passes > 3) {
              jumping.current = false;
              return;
            }
          } else {
            const index = indexOf();
            if (index >= 0) {
              try {
                listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false });
              } catch {
                /* not measured yet: the next pass tries again */
              }
            }
          }
          if (++passes < 14) setTimeout(settle, 150);
          else jumping.current = false;
        };
        setTimeout(settle, 50);
      },
    };
    return () => {
      props.handleRef.current = null;
    };
  }, [props.handleRef, p, node, moveTo, toBottom]);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={listRef}
        data={props.rows}
        keyExtractor={(r) => r.key}
        renderItem={({ item }) => <>{props.renderRow(item)}</>}
        style={{ flex: 1, opacity: ready ? 1 : 0 }}
        contentContainerStyle={{ paddingVertical: 8 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={24}
        scrollEventThrottle={16}
        onScrollToIndexFailed={({ index, averageItemLength }) => listRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: false })}
        // Older history is fetched as the top comes into view.
        onStartReachedThreshold={0.6}
        onStartReached={() => p.current.onReachedStart()}
        onLayout={(e) => {
          s.current.view = e.nativeEvent.layout.height;
        }}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const st = s.current;
          st.offset = contentOffset.y;
          st.content = contentSize.height;
          st.view = layoutMeasurement.height;
          const gap = gapToBottom({ content: st.content, view: st.view, offset: st.offset });
          // Reaching the bottom pins; leaving it unpins only when the reader did it (see `userScrolling`).
          const mine = userScrolling();
          const was = st.pinned;
          if (mine) jumping.current = false; // the reader took over
          if (isAtBottom(gap) && !jumping.current) st.pinned = true;
          else if (mine) st.pinned = false;
          if (st.pinned !== was) p.current.onPinnedChange(st.pinned);
          p.current.onAwayChange(isAway(gap, st.view, st.pinned));
        }}
        onContentSizeChange={(_w, h) => {
          const st = s.current;
          const first = p.current.rows[0]?.key ?? "";
          const shift = offsetAfterPrepend({ firstKey: st.firstKey, content: st.content, offset: st.offset }, { firstKey: first, content: h });
          st.content = h;
          st.firstKey = first;
          if (st.pinned) {
            // At the bottom: stay there as messages arrive and rows settle to their real height.
            toBottom();
            if (!ready && p.current.rows.length > 0) settleSoon();
            // A room whose loaded messages do not fill the window has nothing to scroll up to: fetch until it does.
            const have = p.current.rows.length;
            if (ready && needsFill(h, st.view, have, st.filledFor)) {
              st.filledFor = have;
              p.current.onReachedStart();
            }
          } else if (shift !== null) {
            // Older rows appeared above the view: move down by exactly what was added, so nothing jumps.
            moveTo(shift);
            st.offset = shift;
          }
        }}
      />
      {/* Older history is on its way: skeleton bubbles over the top of the list. They are laid over it, not in it, so that the way the
          list keeps its place when rows are added above is not touched. */}
      {props.olderLoading && (
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: OLDER_SKELETON_HEIGHT, overflow: "hidden", backgroundColor: colors.chatBg }}
        >
          <ChatSkeleton count={OLDER_SKELETON} avatars={!!props.skeletonAvatars} />
        </View>
      )}
    </View>
  );
}
