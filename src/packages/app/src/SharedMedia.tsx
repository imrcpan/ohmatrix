import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import type { MediaKind, TimelineItem } from "@ohmatrix/core";
import { fontFamily, Icon, Spinner, TextButton, useNavBottom, useTheme, VideoViewer } from "@ohmatrix/ui";
import { useController, useServices, useT } from "./context.js";
import { formatBytes } from "./format.js";
import { formatDuration, useAudioPlayer } from "./useAudio.js";
import { PhotoViewer } from "./PhotoViewer.js";
import { Group, Item, PageHeader } from "./settings/kit.js";
import { useMediaUrl } from "./useMedia.js";

const KINDS: { kind: MediaKind; label: "media.photos" | "media.videos" | "media.audio" | "media.files" }[] = [
  { kind: "image", label: "media.photos" },
  { kind: "video", label: "media.videos" },
  { kind: "audio", label: "media.audio" },
  { kind: "file", label: "media.files" },
];

type Content<K extends TimelineItem["content"]["kind"]> = Extract<TimelineItem["content"], { kind: K }>;
const enc = (c: { encryption?: unknown; mimeType?: string }) =>
  c.encryption ? { encryption: c.encryption, ...(c.mimeType ? { mimeType: c.mimeType } : {}) } : {};

/** A square preview of a picture or a video's poster. Press opens it. */
function Tile(props: { item: TimelineItem; size: number; onOpen: () => void }) {
  const { colors } = useTheme();
  const c = props.item.content;
  const poster = c.kind === "video" ? c.thumbnail : undefined;
  const src = c.kind === "image" ? c.url : poster?.url;
  const uri = useMediaUrl(src, {
    width: 200,
    height: 200,
    fit: "crop",
    ...(c.kind === "image" ? enc(c) : poster?.encryption ? { encryption: poster.encryption, mimeType: poster.mimeType ?? "image/jpeg" } : {}),
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={c.kind === "image" ? c.body : c.kind === "video" ? c.name : undefined}
      onPress={props.onOpen}
      style={{ width: props.size, height: props.size, borderRadius: 8, overflow: "hidden", backgroundColor: colors.bgSecondary, cursor: "pointer" } as object}
    >
      {uri ? <Image source={{ uri }} resizeMode="cover" style={{ width: "100%", height: "100%" }} /> : null}
      {c.kind === "video" && (
        <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" } as object}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" }}>
            <Icon name="play" size={16} color="#FFFFFF" />
          </View>
          {!!c.durationMs && (
            <View style={{ position: "absolute", right: 4, bottom: 4, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 5 }}>
              <Text style={{ fontSize: 11, fontFamily, color: "#FFFFFF" }}>{formatDuration(c.durationMs)}</Text>
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

/**
 * A row of the audio and files tabs: an icon block like a picture's tile, so its left edge is the same 18 as the grid's, then the name and a
 * line below it, to 18 from the right edge. (The general list row keeps its icon inside a little margin of its own, which put the left edge of
 * these a few px off the grid's.) The pressed or hovered shade is a rounded band, a little wider than the content.
 */
const ROW_BLOCK = 44;
function MediaRow(props: { icon: "play" | "pause" | "file"; title: string; subtitle: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={props.title} onPress={props.onPress}>
      {({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            minHeight: 60,
            marginHorizontal: 6,
            paddingHorizontal: 12,
            borderRadius: 12,
            backgroundColor: pressed ? colors.separator : hovered ? colors.hover : "transparent",
          }}
        >
          <View
            style={{
              width: ROW_BLOCK,
              height: ROW_BLOCK,
              borderRadius: 8,
              backgroundColor: colors.bgSecondary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name={props.icon} size={20} color={colors.textSecondary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 16, fontFamily, color: colors.text }}>
              {props.title}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontFamily, color: colors.textSecondary, marginTop: 2 }}>
              {props.subtitle}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

/** One audio file or voice message, playable in place. */
function AudioItem(props: { item: TimelineItem }) {
  const t = useT();
  const controller = useController();
  const c = props.item.content as Content<"audio">;
  const audio = useAudioPlayer(() => controller.resolveMedia(c.url, enc(c)), c.durationMs);
  const playing = audio.state.status === "playing";
  return (
    <MediaRow
      title={c.voice ? t("voiceMessage") : c.name}
      subtitle={`${props.item.senderName} · ${playing ? `${formatDuration(audio.state.positionMs)} / ` : ""}${formatDuration(audio.state.durationMs) || formatBytes(c.size)}`}
      icon={playing ? "pause" : "play"}
      onPress={() => void audio.toggle()}
    />
  );
}

/** A picture or video opened in the viewers the chat uses. */
function MediaViewer(props: { item: TimelineItem | null; onClose: () => void }) {
  const t = useT();
  const vc = props.item?.content;
  const full = useMediaUrl(props.item && vc && (vc.kind === "image" || vc.kind === "video") ? vc.url : undefined, vc && "encryption" in vc ? enc(vc) : {});
  const poster = useMediaUrl(vc?.kind === "video" ? vc.thumbnail?.url : undefined, vc?.kind === "video" && vc.thumbnail ? { width: 400, height: 400 } : {});
  return (
    <>
      {vc?.kind === "image" && (
        <PhotoViewer visible onClose={props.onClose} title={vc.body} fileName={vc.body} uri={full} width={vc.width} height={vc.height} />
      )}
      {vc?.kind === "video" && (
        <VideoViewer visible onClose={props.onClose} uri={full} poster={poster} width={vc.width} height={vc.height} closeLabel={t("viewer.close")} />
      )}
    </>
  );
}

/** How many previews the one row of the chat info holds. */
const PREVIEW_COUNT = 4;
const PREVIEW_GAP = 6;
/** Long enough for the info panel to finish sliding in before the scan starts (see SlidePanel). */
const PREVIEW_START_DELAY_MS = 350;

/**
 * The room's shared media in the chat info: one row of the newest pictures and videos, of a height that does not change (so the page does
 * not jump as they arrive), and a View more row that opens the whole gallery. Only what the row shows is fetched: one short page of
 * pictures and one of videos, looking through a little of the history; the rest waits for View more.
 */
export function SharedMediaPreview(props: { roomId: string; onMore: () => void }) {
  const t = useT();
  const { colors } = useTheme();
  const controller = useController();
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [width, setWidth] = useState(300);
  const [viewing, setViewing] = useState<TimelineItem | null>(null);
  const tile = Math.max(48, Math.floor((width - 36 - PREVIEW_GAP * (PREVIEW_COUNT - 1)) / PREVIEW_COUNT));

  // The scan never holds up the chat info: it starts only after the panel has slid in (its own animation is 260 ms; on the web the
  // history is read and decrypted on the same thread), it asks for pictures and then videos one after the other, and each answer is shown
  // as it comes. The row has its final height from the first frame, so nothing moves when they arrive.
  useEffect(() => {
    let live = true;
    setItems(null);
    setFailed(false);
    const found: TimelineItem[] = [];
    const timer = setTimeout(() => {
      void (async () => {
        let errors = 0;
        for (const kind of ["image", "video"] as const) {
          try {
            const page = await controller.sharedMedia(props.roomId, { kind, want: PREVIEW_COUNT, scan: 2 });
            found.push(...page.items);
          } catch {
            errors++;
          }
          if (!live) return;
          setItems([...found].sort((x, y) => y.ts - x.ts).slice(0, PREVIEW_COUNT));
        }
        if (live && errors === 2) setFailed(true);
      })();
    }, PREVIEW_START_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [controller, props.roomId, attempt]);

  return (
    <Group title={t("sharedMedia")}>
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ height: tile + 20, paddingVertical: 10, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", gap: PREVIEW_GAP }}
      >
        {items === null && !failed ? (
          <View style={{ flex: 1, alignItems: "center" }}>
            <Spinner size={28} />
          </View>
        ) : failed ? (
          <Pressable accessibilityRole="button" onPress={() => setAttempt((n) => n + 1)} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ fontSize: 14, fontFamily, color: colors.textSecondary }}>{t("media.failed")}</Text>
          </Pressable>
        ) : items && items.length === 0 ? (
          <Text style={{ flex: 1, textAlign: "center", fontSize: 14, fontFamily, color: colors.textTertiary }}>{t("media.noneVisual")}</Text>
        ) : (
          items?.map((i) => <Tile key={i.id} item={i} size={tile} onOpen={() => setViewing(i)} />)
        )}
      </View>
      <Item label={t("media.viewMore")} onPress={props.onMore} />
      <MediaViewer item={viewing} onClose={() => setViewing(null)} />
    </Group>
  );
}

/**
 * The whole gallery, a page of its own: tabs by kind. Each tab reaches back through the room's history a page at a time (not only
 * what the chat has loaded), shows pictures and videos as a grid and audio and files as a list, and opens pictures and videos in the
 * viewers the chat uses. It is mounted only while the page is open, so nothing here is fetched before View more is pressed.
 */
export function SharedMediaPage(props: { roomId: string; onBack: () => void }) {
  const t = useT();
  const { colors } = useTheme();
  const controller = useController();
  const services = useServices();
  const nav = useNavBottom();
  const [kind, setKind] = useState<MediaKind>("image");
  const [lists, setLists] = useState<Partial<Record<MediaKind, { items: TimelineItem[]; next?: string | undefined; done: boolean }>>>({});
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [width, setWidth] = useState(300);
  const [viewing, setViewing] = useState<TimelineItem | null>(null);
  const busy = useRef(false);
  const list = lists[kind];

  const more = useCallback(
    async (k: MediaKind) => {
      if (busy.current) return;
      busy.current = true;
      setLoading(true);
      setFailed(false);
      try {
        const cur = lists[k];
        const page = await controller.sharedMedia(props.roomId, { kind: k, ...(cur?.next ? { from: cur.next } : {}), want: 24 });
        setLists((all) => {
          const have = all[k]?.items ?? [];
          const seen = new Set(have.map((i) => i.id));
          return { ...all, [k]: { items: [...have, ...page.items.filter((i) => !seen.has(i.id))], next: page.next, done: !page.next } };
        });
      } catch {
        setFailed(true);
      } finally {
        busy.current = false;
        setLoading(false);
      }
    },
    [controller, props.roomId, lists],
  );

  // The first look at a tab loads its first page.
  useEffect(() => {
    if (!lists[kind] && !busy.current) void more(kind);
  }, [kind, lists, more]);

  const items = list?.items ?? [];
  const grid = kind === "image" || kind === "video";
  const tile = Math.max(60, Math.floor((width - 36 - 12) / 3));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <PageHeader title={t("sharedMedia")} onBack={props.onBack} backLabel={t("chatInfo")} />
      <ScrollView contentContainerStyle={{ paddingBottom: 28 + nav }}>
        <View accessibilityRole="tablist" style={{ flexDirection: "row", paddingVertical: 6, paddingHorizontal: 18, gap: 4 }}>
          {KINDS.map((k) => (
            <Pressable
              key={k.kind}
              accessibilityRole="tab"
              accessibilityState={{ selected: k.kind === kind }}
              aria-selected={k.kind === kind}
              accessibilityLabel={t(k.label)}
              onPress={() => setKind(k.kind)}
              style={({ hovered }: { hovered?: boolean; pressed: boolean }) => ({
                flex: 1,
                height: 30,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: k.kind === kind ? colors.accent : hovered ? colors.hover : "transparent",
              })}
            >
              <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "600", fontFamily, color: k.kind === kind ? colors.onAccent : colors.textSecondary }}>
                {t(k.label)}
              </Text>
            </Pressable>
          ))}
        </View>
        {grid ? (
          <View
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingVertical: 10, paddingHorizontal: 18 }}
          >
            {items.map((i) => (
              <Tile key={i.id} item={i} size={tile} onOpen={() => setViewing(i)} />
            ))}
          </View>
        ) : (
          items.map((i) =>
            i.content.kind === "audio" ? (
              <AudioItem key={i.id} item={i} />
            ) : i.content.kind === "file" ? (
              <MediaRow
                key={i.id}
                icon="file"
                title={i.content.name}
                subtitle={`${i.senderName}${i.content.size ? ` · ${formatBytes(i.content.size)}` : ""}`}
                onPress={() => {
                  const c = i.content as Content<"file">;
                  void controller
                    .resolveMedia(c.url, enc(c))
                    .then((url) => services.saveFile?.({ url, name: c.name }))
                    .catch(() => {});
                }}
              />
            ) : null,
          )
        )}
        {list && items.length === 0 && !loading && !failed && <Item label={t("media.none")} chevron={false} />}
        {failed && <Item label={t("media.failed")} chevron={false} onPress={() => void more(kind)} />}
        {loading && <Item label={t("media.loading")} chevron={false} />}
        {!!list?.next && !loading && !failed && (
          <View style={{ alignItems: "center", paddingVertical: 4 }}>
            <TextButton title={t("media.more")} onPress={() => void more(kind)} />
          </View>
        )}
      </ScrollView>
      <MediaViewer item={viewing} onClose={() => setViewing(null)} />
    </View>
  );
}
