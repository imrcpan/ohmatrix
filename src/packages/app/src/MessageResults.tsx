import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { SearchPage, SearchResult } from "@ohmatrix/core";
import { Avatar, fontFamily, useTheme } from "@ohmatrix/ui";
import { useController, useLocale, useT } from "./context.js";
import { formatListTime } from "./format.js";
import { makeSnippet } from "./snippet.js";
import { useMediaUrl } from "./useMedia.js";

/** Debounced message search: results, "show more" paging and a note about encrypted chats. */
export function useMessageSearch(term: string, roomId?: string) {
  const controller = useController();
  const [page, setPage] = useState<{ results: SearchResult[]; next?: string; localRooms: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const active = term.trim().length >= 2;

  useEffect(() => {
    if (!active) {
      setPage(null);
      setBusy(false);
      return;
    }
    setBusy(true);
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      controller.searchMessages({ term, ...(roomId && { roomId }) }).then(
        (p) => {
          if (mine === seq.current) {
            setPage(p);
            setBusy(false);
          }
        },
        () => {
          if (mine === seq.current) {
            setPage({ results: [], localRooms: 0 });
            setBusy(false);
          }
        },
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [term, roomId, controller, active]);

  const more = () => {
    if (!page?.next) return;
    setBusy(true);
    const mine = ++seq.current;
    controller.searchMessages({ term, from: page.next, ...(roomId && { roomId }) }).then(
      (p: SearchPage) => {
        if (mine === seq.current) {
          setPage((cur) => ({ results: [...(cur?.results ?? []), ...p.results], localRooms: cur?.localRooms ?? 0, ...(p.next && { next: p.next }) }));
          setBusy(false);
        }
      },
      () => {
        if (mine === seq.current) setBusy(false);
      },
    );
  };
  return { active, page, busy, more };
}

function Hit(props: { r: SearchResult; term: string; showRoom: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const locale = useLocale();
  const snip = makeSnippet(props.r.text, props.term);
  const room = useController()
    .store.getState()
    .rooms.find((x) => x.id === props.r.roomId);
  const avatar = useMediaUrl(room?.avatar, { width: 72, height: 72, fit: "crop" });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${props.r.roomName}: ${props.r.text}`}
      onPress={props.onPress}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
        flexDirection: "row",
        gap: 11,
        marginHorizontal: 6,
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
      })}
    >
      {props.showRoom && <Avatar id={props.r.roomId} name={props.r.roomName} size={36} src={avatar} />}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", gap: 8, alignItems: "baseline" }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, fontWeight: "600", fontFamily, color: colors.text }}>
            {props.showRoom ? props.r.roomName : props.r.senderName}
          </Text>
          <Text style={{ fontSize: 12, fontFamily, color: colors.textSecondary }}>{formatListTime(props.r.ts, Date.now(), locale)}</Text>
        </View>
        <Text numberOfLines={2} style={{ fontSize: 14, lineHeight: 19, fontFamily, color: colors.textSecondary }}>
          {props.showRoom ? `${props.r.senderName}: ` : ""}
          {snip.before}
          <Text style={{ color: colors.accent, fontWeight: "700" }}>{snip.match}</Text>
          {snip.after}
        </Text>
      </View>
    </Pressable>
  );
}

/** The result list itself; `showRoom` adds the chat name and avatar (global search). */
export function MessageResults(props: { term: string; roomId?: string; showRoom: boolean; onPick: (r: SearchResult) => void }) {
  const { colors } = useTheme();
  const t = useT();
  const { active, page, busy, more } = useMessageSearch(props.term, props.roomId);
  if (!active) return <Text style={{ textAlign: "center", padding: 24, fontSize: 14, fontFamily, color: colors.textSecondary }}>{t("search.hint")}</Text>;
  return (
    <View>
      {(page?.results ?? []).map((r) => (
        <Hit key={`${r.roomId}-${r.eventId}`} r={r} term={props.term.trim()} showRoom={props.showRoom} onPress={() => props.onPick(r)} />
      ))}
      {busy && (
        <View style={{ height: 48, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      )}
      {!busy && page && page.results.length === 0 && (
        <Text style={{ textAlign: "center", padding: 24, fontSize: 15, fontFamily, color: colors.textSecondary }}>{t("search.empty")}</Text>
      )}
      {!busy && !!page?.next && (
        <Pressable accessibilityRole="button" onPress={more} style={{ alignItems: "center", padding: 12 }}>
          <Text style={{ fontSize: 15, fontWeight: "500", fontFamily, color: colors.accent }}>{t("search.more")}</Text>
        </Pressable>
      )}
      {!busy && !!page && page.localRooms > 0 && (
        <Text style={{ textAlign: "center", paddingHorizontal: 20, paddingBottom: 14, fontSize: 12, lineHeight: 16, fontFamily, color: colors.textSecondary }}>
          {t("search.local")}
        </Text>
      )}
    </View>
  );
}
