import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, View } from "react-native";
import type { Row } from "../timelineRows.js";
import type { MessageListProps } from "./messageList.js";
import { gapToBottom, isAtBottom, isAway, needsFill } from "./scrollMath.js";
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
  querySelectorAll(sel: string): ArrayLike<{ getAttribute(n: string): string | null; getBoundingClientRect(): { top: number; bottom: number } }>;
  style: { overflowAnchor?: string };
}
interface Observer {
  observe(el: unknown, o: { childList?: boolean; subtree?: boolean; attributes?: boolean; characterData?: boolean }): void;
  disconnect(): void;
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
  const listRef = useRef<FlatList<Row>>(null);
  const s = useRef({ offset: 0, content: 0, view: 0, pinned: true, filledFor: -1, askedAt: 0 });
  // The message at the top of the view and how far below the top of the view it is: whatever is added or resized above it, it is put back there.
  const anchor = useRef<{ key: string; top: number } | null>(null);
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

  /** Remember which message is at the top of the view, and where. */
  const capture = useCallback(() => {
    const n = node();
    if (!n) return;
    const view = n.getBoundingClientRect();
    for (const el of Array.from(n.querySelectorAll("[data-row-key]"))) {
      const r = el.getBoundingClientRect();
      if (r.bottom > view.top + 1) {
        anchor.current = { key: el.getAttribute("data-row-key") ?? "", top: r.top - view.top };
        return;
      }
    }
    anchor.current = null;
  }, [node]);
  /**
   * Put the remembered message back where it was. Older rows arriving above it, the skeleton coming and going, rows above it being measured
   * to their real height: none of it may move what the reader is looking at. This runs as the page changes, before it is painted, so
   * nothing is seen to jump (and it is the same for every kind of change, which the arithmetic on content heights was not).
   */
  const restore = useCallback(() => {
    const a = anchor.current;
    const n = node();
    if (!n || jumping.current) return;
    if (s.current.pinned) {
      // At the bottom: rows arriving or settling to their real height keep the newest message where it is, before the page is painted
      // (waiting for the list to report its new size would show one frame with the newest message pushed out of view).
      if (n.scrollHeight - n.clientHeight - n.scrollTop > 0.5) moveTo(n.scrollHeight);
      return;
    }
    if (!a) return;
    const el = Array.from(n.querySelectorAll("[data-row-key]")).find((e) => e.getAttribute("data-row-key") === a.key);
    if (!el) return;
    const diff = el.getBoundingClientRect().top - n.getBoundingClientRect().top - a.top;
    if (Math.abs(diff) >= 1) moveTo(n.scrollTop + diff);
  }, [node, moveTo]);
  useEffect(() => {
    let observer: Observer | undefined;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const attach = () => {
      const n = node();
      const Mutation = (globalThis as { MutationObserver?: new (cb: () => void) => Observer }).MutationObserver;
      if (!n || !Mutation) {
        if (tries++ < 20) timer = setTimeout(attach, 50);
        return;
      }
      n.style.overflowAnchor = "none"; // the browser's own anchoring would move the view a second time
      observer = new Mutation(restore);
      observer.observe(n, { childList: true, subtree: true, attributes: true });
    };
    timer = setTimeout(attach, 0);
    return () => {
      if (timer) clearTimeout(timer);
      observer?.disconnect();
    };
  }, [node, restore]);

  // Whether the reader is the one scrolling. Scroll events also come from our own jumps and from the browser adjusting
  // for rows that change height, and neither means the reader left the bottom; only a scroll while they are using the
  // wheel, a finger, the keyboard or the scrollbar does. (Watching the input is what tells them apart; guessing from
  // the scroll event, or from "a moment since our last jump", mistakes one for the other.)
  // While we are bringing a row into view the view starts out near the bottom, and must not be taken for "back at the
  // bottom" (which would pin it there and undo the jump): this holds the list off the bottom until the jump is over.
  const jumping = useRef(false);
  const lastInput = useRef(0);
  const dragging = useRef(false);
  // Whether the reader has scrolled at all. Until then the list is where it opened (at the newest message), and its being "at the top"
  // of what is drawn (before it has moved to the bottom, say) is no reason to read or draw anything older.
  const touched = useRef(false);
  /**
   * Ask for older history when the reader is at the top, or near it. Called for every scroll and for every push at the top (a wheel turned
   * up, a finger pulling down, a key): a push at the very top moves nothing, so it makes no scroll event, and without it the reader
   * would pull in vain. Not more often than every so often: the answer to the last one may still be on its way.
   */
  const askOlder = useCallback(() => {
    const n = node();
    const st = s.current;
    if (!touched.current || !n) return;
    if (n.scrollTop >= (st.view || n.clientHeight) * 0.6) return;
    const now = Date.now();
    if (now - st.askedAt < 250) return;
    st.askedAt = now;
    p.current.onReachedStart();
  }, [node, p]);
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
      const touch = () => {
        lastInput.current = Date.now();
        touched.current = true;
      };
      const key = (e: KeyLike) => {
        const typing = e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA" || e.target?.isContentEditable;
        if (typing || !["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown", " "].includes(e.key)) return;
        touch();
        if (["PageUp", "Home", "ArrowUp"].includes(e.key)) askOlder();
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
      const wheel = (e: { deltaY: number }) => {
        touch();
        if (e.deltaY < 0) askOlder(); // up is toward older messages
      };
      const finger = () => {
        touch();
        askOlder(); // a finger moving on the list at the top is pulling it down
      };
      el.addEventListener("wheel", wheel, { passive: true });
      el.addEventListener("touchmove", finger, { passive: true });
      el.addEventListener("pointerdown", down);
      doc.addEventListener("pointerup", up);
      doc.addEventListener("keydown", key);
      off = () => {
        el.removeEventListener("wheel", wheel);
        el.removeEventListener("touchmove", finger);
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
  }, [node, askOlder]);

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
        // Older history is on its way: skeleton bubbles at the top of the list, inline with real messages.
        ListHeaderComponent={
          props.olderLoading ? (
            <View style={{ height: OLDER_SKELETON_HEIGHT, overflow: "hidden" }}>
              <ChatSkeleton count={OLDER_SKELETON} avatars={!!props.skeletonAvatars} />
            </View>
          ) : null
        }
        style={{ flex: 1, opacity: ready ? 1 : 0 }}
        contentContainerStyle={{ paddingVertical: 8 }}
        keyboardShouldPersistTaps="handled"
        // The rows handed over are already the newest two screens or so (see useRowWindow): draw all of them at once. The list's own batching
        // (ten rows every 50 ms, oldest first) would show the newest messages last, popping in one batch after another under a view
        // that has already gone to the bottom.
        initialNumToRender={80}
        maxToRenderPerBatch={80}
        scrollEventThrottle={16}
        onScrollToIndexFailed={({ index, averageItemLength }) => listRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: false })}
        onLayout={(e) => {
          s.current.view = e.nativeEvent.layout.height;
        }}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const st = s.current;
          st.offset = contentOffset.y;
          st.content = contentSize.height;
          st.view = layoutMeasurement.height;
          capture();
          askOlder(); // near the top
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
          st.content = h;
          if (st.pinned) {
            // At the bottom: stay there as messages arrive and rows settle to their real height.
            toBottom();
            if (!ready && p.current.rows.length > 0) settleSoon();
            // A room whose loaded messages do not fill the window has nothing to scroll up to: fetch until it does.
            const have = p.current.rows.length;
            if (ready && needsFill(h, st.view, have, st.filledFor, 1)) {
              st.filledFor = have;
              p.current.onReachedStart();
            }
          } else restore(); // a size that changed without the page changing (a picture arriving)
        }}
      />
    </View>
  );
}
