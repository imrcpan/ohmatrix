import { useEffect, useMemo, useRef } from "react";
import { FlatList } from "react-native";
import type { Row } from "../timelineRows.js";
import type { MessageListProps } from "./messageList.js";
import { isAtBottom, isAway, needsFill } from "./scrollMath.js";
import { useLatest } from "./useLatest.js";

/**
 * The native message list: an inverted list, the newest message first, so offset 0 is the bottom. That is how chats are
 * built on a phone, and it needs almost nothing from us: it opens at the newest message, new ones appear in place,
 * older rows are added at the far end without moving anything, and the system's own scrolling and momentum apply.
 * (The web lists rows in reading order instead, see `MessageList.web.tsx`.)
 */
export function MessageList(props: MessageListProps) {
  const p = useLatest(props);
  const listRef = useRef<FlatList<Row>>(null);
  const s = useRef({ pinned: true, away: false, view: 0, filledFor: -1, size: 0, tries: 0 });
  const data = useMemo(() => [...props.rows].reverse(), [props.rows]);
  const dataRef = useLatest(data);

  // The list is at the newest message from the first frame, but a short room reads older history to fill the window
  // (below), and rows are measured as they arrive: wait until the content has stopped changing before it is shown,
  // so the reader never sees it grow.
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ready = useRef(false);
  const settleSoon = () => {
    if (ready.current) return;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      ready.current = true;
      p.current.onReady();
    }, 400);
  };
  // A page of history can come back without a new row (events that show nothing), so a window still not full is asked
  // about again a moment later, a few times, until the history runs out.
  const fill = () => {
    const have = p.current.rows.length;
    if (!p.current.loaded || !needsFill(s.current.size, s.current.view, have, s.current.filledFor)) return;
    if (s.current.filledFor !== have) s.current.tries = 0;
    s.current.filledFor = have;
    p.current.onReachedStart();
    if (++s.current.tries > 5) return;
    setTimeout(() => {
      if (p.current.rows.length === have) {
        s.current.filledFor = -1;
        fill();
      }
    }, 1000);
  };
  useEffect(() => {
    // A room with nothing in it never changes size.
    if (props.loaded && props.rows.length === 0 && !ready.current) {
      ready.current = true;
      p.current.onReady();
    }
  }, [props.loaded, props.rows.length, p]);
  useEffect(() => {
    const giveUp = setTimeout(() => {
      if (!ready.current) {
        ready.current = true;
        p.current.onReady();
      }
    }, 10_000);
    return () => {
      clearTimeout(giveUp);
      if (settle.current) clearTimeout(settle.current);
    };
  }, [p]);

  useEffect(() => {
    props.handleRef.current = {
      scrollToLatest: () => {
        s.current.pinned = true;
        p.current.onPinnedChange(true);
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      },
      scrollToRow: (key) => {
        const index = dataRef.current.findIndex((r) => r.key === key);
        if (index < 0) return;
        try {
          listRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false });
        } catch {
          /* the failure callback below estimates the position */
        }
      },
    };
    return () => {
      props.handleRef.current = null;
    };
  }, [props.handleRef, p, dataRef]);

  // The oldest row in view is the top of the screen: the highest index in an inverted list.
  const viewable = useRef(({ viewableItems }: { viewableItems: Array<{ item: unknown; index?: number | null | undefined }> }) => {
    const top = viewableItems.filter((v) => v.index != null).sort((a, b) => b.index! - a.index!)[0]?.item as Row | undefined;
    if (top) p.current.onVisibleTop(top);
  }).current;
  const viewConfig = useRef({ itemVisiblePercentThreshold: 10 }).current;

  return (
    <FlatList
      ref={listRef}
      inverted
      // A new message arrives at offset 0: a reader scrolled back keeps their place, one at the bottom follows it.
      maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 10 }}
      data={data}
      keyExtractor={(r) => r.key}
      renderItem={({ item }) => <>{props.renderRow(item)}</>}
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingVertical: 8 }}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={24}
      scrollEventThrottle={16}
      // The far end of an inverted list is the oldest row.
      onEndReachedThreshold={0.6}
      onEndReached={() => p.current.onReachedStart()}
      onLayout={(e) => {
        s.current.view = e.nativeEvent.layout.height;
        fill(); // the content may have been measured before the window was
      }}
      // A room whose loaded messages do not fill the window has nothing to scroll back through, so nothing would ever
      // ask for older history: ask until it does (once per amount of history; early measurements are rough).
      onContentSizeChange={(_w, h) => {
        if (p.current.rows.length > 0) settleSoon();
        s.current.size = h;
        fill();
      }}
      onScrollToIndexFailed={({ index, averageItemLength }) => listRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: false })}
      onViewableItemsChanged={viewable}
      viewabilityConfig={viewConfig}
      onScroll={(e) => {
        const { contentOffset, layoutMeasurement } = e.nativeEvent;
        const gap = contentOffset.y; // the distance from the newest message, since offset 0 is the bottom
        const pinned = isAtBottom(gap);
        if (pinned !== s.current.pinned) {
          s.current.pinned = pinned;
          p.current.onPinnedChange(pinned);
        }
        const away = isAway(gap, layoutMeasurement.height, pinned);
        if (away !== s.current.away) {
          s.current.away = away;
          p.current.onAwayChange(away);
        }
        p.current.onMoving();
      }}
    />
  );
}
