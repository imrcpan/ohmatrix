import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, Text, View, type DimensionValue } from "react-native";
import type { PublicRoom } from "@ohmatrix/core";
import {
  Avatar,
  DialogFrame,
  fontFamily,
  Icon,
  IconButton,
  Pulse,
  ScaleRoot,
  SearchField,
  SkeletonBlock,
  useInsets,
  useScale,
  useTheme,
  useViewport,
} from "@ohmatrix/ui";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { PromptDialog } from "./PromptDialog.js";
import { serverName } from "./serverName.js";
import { useAppState, useController, useServices, useT } from "./context.js";
import { addJoining, removeJoining } from "./joining.js";
import { useNotice } from "./useNotice.js";
import { useMediaUrl } from "./useMedia.js";

const GAP = 12;
const PAD = 16;
/** The narrowest a card is made: a window that fits two of these side by side shows two columns, and so on. */
const CARD_MIN = 300;
/** A room with more members than this is slow to join (the homeserver does it over on the room's own server): the notice says so. */
const BIG_ROOM = 1000;
/** How long the notice of a room being joined stays; after it the room is shown at the top of the chat list while the join goes on. */
const NOTICE_MS = 3000;
/** The directory of the homeserver itself, as a choice among the servers. */
const OWN = "";
const TOPIC_LINES = 3;
const TOPIC_LINE_HEIGHT = 19;

/**
 * What a card shows, small on the page or large over it: who the room is, its text (`topic`) and the buttons (`actions`). `loading` is for a card
 * opened before the server has told how many people are in the room: a grey bar stands in the line of the count.
 */
export function CardFace(props: { room: PublicRoom; avatar: string | undefined; topic: ReactNode; actions: ReactNode; loading?: boolean }) {
  const { colors } = useTheme();
  const t = useT();
  const { room } = props;
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Avatar id={room.roomId} name={room.name} size={52} src={props.avatar} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={2} style={{ fontSize: 17, fontWeight: "700", fontFamily, color: colors.text }}>
            {room.name}
          </Text>
          {props.loading ? (
            <View style={{ height: 17, justifyContent: "center" }}>
              <Pulse>
                <SkeletonBlock width={90} height={11} />
              </Pulse>
            </View>
          ) : (
            <Text numberOfLines={1} style={{ fontSize: 13, fontFamily, color: colors.textSecondary }}>
              {t("explore.members", { count: room.members })}
            </Text>
          )}
        </View>
      </View>
      {props.topic}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>{props.actions}</View>
    </>
  );
}

function Card(props: { room: PublicRoom; width: DimensionValue; busy: boolean; joined: boolean; onJoin: () => void }) {
  const { colors } = useTheme();
  const t = useT();
  const { room } = props;
  const avatar = useMediaUrl(room.avatar, { width: 112, height: 112, fit: "crop" });
  const { width: window, height: viewport } = useViewport();
  const services = useServices();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const copyAddress = () => {
    const nav = (globalThis as { navigator?: { clipboard?: { writeText(s: string): Promise<void> } } }).navigator;
    const write = services.copyText ?? nav?.clipboard?.writeText.bind(nav.clipboard);
    void write?.(room.alias ?? room.roomId).then(
      () => setCopied(true),
      () => {},
    );
  };
  const [full, setFull] = useState(false);
  const topic = room.topic?.replace(/\s+/g, " ").trim() ?? "";
  const topicStyle = { fontSize: 14, lineHeight: TOPIC_LINE_HEIGHT, fontFamily, color: colors.textSecondary };
  const cardStyle = { borderRadius: 16, padding: 16, gap: 10 } as const;
  const actions = (after?: () => void) => (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("explore.copy")}
        onPress={copyAddress}
        style={({ pressed }) => ({
          borderRadius: 14,
          paddingHorizontal: 16,
          paddingVertical: 6,
          opacity: pressed ? 0.7 : 1,
          backgroundColor: colors.hover,
        })}
      >
        <Text style={{ fontSize: 14, fontWeight: "600", fontFamily, color: colors.text }}>{copied ? t("copied") : t("explore.copy")}</Text>
      </Pressable>
      {props.joined ? (
        <View
          accessibilityLabel={`${t("explore.in")}: ${room.name}`}
          style={{ borderRadius: 14, paddingHorizontal: 16, paddingVertical: 6, backgroundColor: colors.hover }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", fontFamily, color: colors.textSecondary }}>{t("explore.in")}</Text>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t("join")} ${room.name}`}
          disabled={props.busy}
          onPress={() => {
            after?.();
            props.onJoin();
          }}
          style={({ pressed }) => ({
            borderRadius: 14,
            paddingHorizontal: 16,
            paddingVertical: 6,
            opacity: props.busy || pressed ? 0.7 : 1,
            backgroundColor: colors.accent,
          })}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", fontFamily, color: colors.onAccent }}>{t("join")}</Text>
        </Pressable>
      )}
    </>
  );
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={room.name}
        onPress={() => setFull(true)}
        style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
          ...cardStyle,
          width: props.width,
          minHeight: 168,
          backgroundColor: pressed || hovered ? colors.separator : colors.bgSecondary,
        })}
      >
        <CardFace
          room={room}
          avatar={avatar}
          topic={
            <View style={{ flex: 1 }}>
              <Text numberOfLines={TOPIC_LINES} style={topicStyle}>
                {topic}
              </Text>
            </View>
          }
          actions={actions()}
        />
      </Pressable>
      {/* The same card, larger: the whole text, scrolling inside when it is long. */}
      <DialogFrame visible={full} onClose={() => setFull(false)}>
        <Pressable onPress={() => {}} style={{ ...cardStyle, width: Math.min(window - 48, 560), backgroundColor: colors.bgSecondary }}>
          <CardFace
            room={room}
            avatar={avatar}
            topic={
              <ScrollView style={{ maxHeight: Math.max(160, viewport * 0.5) }}>
                <Text selectable style={topicStyle}>
                  {room.topic?.trim() ?? ""}
                </Text>
              </ScrollView>
            }
            actions={actions(() => setFull(false))}
          />
        </Pressable>
      </DialogFrame>
    </>
  );
}

/** The server's public rooms as cards over the whole window (several columns when it is wide): search, tap one, and it is joined and opened. A longer list is read on as it is scrolled. */
export function ExploreScreen(props: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const t = useT();
  const controller = useController();
  const [query, setQuery] = useState("");
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [next, setNext] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const notice = useNotice();
  // The rooms I am in (an invitation is not that yet), so that a card of one of them says so instead of offering to join.
  const rooms_ = useAppState((s) => s.rooms);
  const mine = useMemo(() => new Set(rooms_.filter((x) => !x.invite).flatMap((x) => [x.id])), [rooms_]);
  const [joining, setJoining] = useState<string | null>(null);
  const [asking, setAsking] = useState<PublicRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  // Whose directory: the homeserver's own (what most people start with, but a small server lists little), or a big one asked through it.
  const own = useAppState((s) => s.userId?.replace(/^[^:]*:/, "") ?? "");
  // matrix.org's directory is the one shown first (its rooms are the ones most people look for); the homeserver's own comes next. `OWN` stands
  // for the homeserver itself, which is what the directory request means by no server at all.
  const [pick, setPick] = useState<string | undefined>(undefined);
  const servers =
    own === "matrix.org"
      ? [{ id: OWN, name: own }]
      : [
          { id: "matrix.org", name: "matrix.org" },
          { id: OWN, name: own },
        ];
  // The servers the person added are kept with the other settings.
  const extra = useAppState((s) => s.prefs.exploreServers);
  const [adding, setAdding] = useState(false);
  const all = [...servers, ...extra.filter((x) => !servers.some((s) => s.name === x)).map((x) => ({ id: x, name: x }))];
  const chosen = pick ?? servers[0]!.id;
  const server = chosen === OWN ? undefined : chosen;
  const scale = useScale();
  const insets = useInsets();
  const { width } = useViewport();
  // On the web the browser lays the cards out: as many columns as fit the room the list has, each as wide as that room shares out among them (CSS grid),
  // so a scrollbar, the zoom of the interface or the width of the window need not be reckoned with here. Elsewhere the width of a card is worked out
  // from the window (a phone's scroll indicator takes no room from the list).
  const web = Platform.OS === "web";
  const inner = width - insets.left - insets.right - 2 * PAD;
  const columns = Math.max(1, Math.floor((inner + GAP) / (CARD_MIN + GAP)));
  const cardWidth = Math.floor((inner - GAP * (columns - 1)) / columns);

  useEffect(() => {
    if (!props.visible) return;
    setBusy(true);
    const mine = ++seq.current;
    const timer = setTimeout(
      () => {
        controller.exploreRooms(query, undefined, server).then(
          (r) => {
            if (mine !== seq.current) return;
            setRooms(r.rooms);
            setNext(r.next);
            setError(null);
            setLoaded(true);
            setBusy(false);
          },
          (e: unknown) => {
            if (mine !== seq.current) return;
            setRooms([]);
            setNext(undefined);
            setError(e instanceof Error ? e.message : String(e));
            setLoaded(true);
            setBusy(false);
          },
        );
      },
      query ? 250 : 0,
    );
    return () => clearTimeout(timer);
  }, [props.visible, query, server, controller]);

  const more = () => {
    if (!next || busy) return;
    setBusy(true);
    const mine = ++seq.current;
    controller.exploreRooms(query, next, server).then(
      (r) => {
        if (mine !== seq.current) return;
        setRooms((cur) => [...cur, ...r.rooms.filter((n) => !cur.some((c) => c.roomId === n.roomId))]);
        setNext(r.next);
        setBusy(false);
      },
      () => {
        if (mine === seq.current) setBusy(false);
      },
    );
  };

  const close = () => {
    seq.current++;
    setQuery("");
    setPick(undefined);
    setRooms([]);
    setNext(undefined);
    setLoaded(false);
    setError(null);
    props.onClose();
  };

  const join = (room: PublicRoom) => {
    if (joining) return;
    setJoining(room.roomId);
    setError(null);
    // By id, asking the servers it is on (the one of its address and the one that made it): the homeserver then joins at once, without
    // first having to look the address up on another server.
    const via = [room.alias, room.roomId].flatMap((x) => (x?.includes(":") ? [x.slice(x.indexOf(":") + 1)] : []));
    // The page goes away at once and the join goes on behind a notice at the top: a big room on another server can take a long while.
    close();
    const big = room.members > BIG_ROOM;
    notice.show(
      big ? `${t("explore.joining", { name: room.name })} ${t("explore.joining.big")}` : t("explore.joining", { name: room.name }),
      "progress",
      NOTICE_MS,
    );
    const since = Date.now();
    const shown = setTimeout(() => addJoining({ id: room.roomId, name: room.name, avatar: room.avatar, since }), NOTICE_MS);
    controller
      .joinRoom(room.roomId, [...new Set(via)])
      .then(
        () => notice.show(t("explore.joined", { name: room.name })),
        (e: unknown) => notice.show(e instanceof Error ? e.message : String(e), "error"),
      )
      .finally(() => {
        clearTimeout(shown);
        removeJoining(room.roomId);
        setJoining(null);
      });
  };

  return (
    <Modal visible={props.visible} animationType="fade" onRequestClose={close}>
      <ScaleRoot scale={scale}>
        <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: PAD - 8, height: 56 }}>
            <IconButton icon="close" label={t("cancel")} onPress={close} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 20, fontWeight: "700", fontFamily, color: colors.text }}>
              {t("explore")}
            </Text>
          </View>
          <View style={{ paddingHorizontal: PAD, paddingBottom: 10 }}>
            <SearchField value={query} onChangeText={setQuery} placeholder={t("explore.search")} />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: PAD, paddingBottom: 10 }}>
            {all.map((sv) => (
              <Pressable
                key={sv.name}
                accessibilityRole="button"
                accessibilityState={{ selected: chosen === sv.id }}
                onPress={() => setPick(sv.id)}
                style={{ borderRadius: 14, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: chosen === sv.id ? colors.accent : colors.hover }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", fontFamily, color: chosen === sv.id ? colors.onAccent : colors.text }}>{sv.name}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("explore.add")}
              onPress={() => setAdding(true)}
              style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                borderRadius: 14,
                paddingLeft: 10,
                paddingRight: 14,
                paddingVertical: 6,
                backgroundColor: pressed || hovered ? colors.separator : colors.hover,
              })}
            >
              <Icon name="plus" size={16} strokeWidth={2.6} color={colors.text} />
              <Text style={{ fontSize: 14, fontWeight: "600", fontFamily, color: colors.text }}>{t("explore.add")}</Text>
            </Pressable>
          </View>
          {!!error && (
            <Text style={{ color: colors.danger, fontSize: 14, fontFamily, textAlign: "center", paddingHorizontal: PAD, paddingBottom: 8 }}>{error}</Text>
          )}
          <ScrollView
            // The scrollbar is always there (on the web), so the width the cards have does not change when it comes and goes as the list grows: the
            // columns are laid out for the width they will keep.
            style={{ flex: 1, ...({ overflowY: "scroll" } as object) }}
            contentContainerStyle={{ padding: PAD, paddingTop: 6, paddingBottom: PAD + (insets.bottom ?? 0), gap: GAP }}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={64}
            onScroll={(e) => {
              const n = e.nativeEvent;
              if (n.contentOffset.y + n.layoutMeasurement.height > n.contentSize.height - 200) more();
            }}
          >
            <View
              style={
                web
                  ? ({ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN}px, 1fr))`, gap: GAP } as object)
                  : { flexDirection: "row", flexWrap: "wrap", gap: GAP }
              }
            >
              {rooms.map((r) => (
                <Card
                  key={r.roomId}
                  room={r}
                  width={web ? "100%" : cardWidth}
                  busy={joining !== null}
                  joined={mine.has(r.roomId)}
                  onJoin={() => setAsking(r)}
                />
              ))}
            </View>
            {busy && (
              <View style={{ height: 52, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator color={colors.textSecondary} />
              </View>
            )}
            {!busy && loaded && rooms.length === 0 && !error && (
              <Text style={{ textAlign: "center", paddingVertical: 24, fontSize: 15, fontFamily, color: colors.textSecondary }}>{t("explore.empty")}</Text>
            )}
          </ScrollView>
        </View>
        <PromptDialog
          visible={adding}
          title={t("explore.add.title")}
          message={t("explore.add.body")}
          confirmLabel={t("explore.add")}
          fields={[{ label: t("explore.add.server"), placeholder: "kde.org" }]}
          onClose={() => setAdding(false)}
          onConfirm={async ([typed]) => {
            const name = serverName(typed ?? "");
            if (!name) throw new Error(t("explore.add.invalid"));
            // Asked once now, so that a server that does not share its rooms is said so here and does not become a button that only fails.
            await controller.exploreRooms("", undefined, name);
            if (!extra.includes(name) && name !== own && name !== "matrix.org") controller.setPreferences({ exploreServers: [...extra, name] });
            setPick(name);
            setAdding(false);
          }}
        />
        <ConfirmDialog
          visible={!!asking}
          title={t("explore.confirm", { name: asking?.name ?? "" })}
          confirmLabel={t("join")}
          onClose={() => setAsking(null)}
          onConfirm={() => {
            const room = asking;
            setAsking(null);
            if (room) join(room);
          }}
        />
      </ScaleRoot>
    </Modal>
  );
}
