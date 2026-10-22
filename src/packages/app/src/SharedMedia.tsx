import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import type { MediaKind, TimelineItem } from "@ohmatrix/core";
import { fontFamily, Icon, Spinner, TextButton, useNavBottom, useTheme, VideoViewer } from "@ohmatrix/ui";
import { useController, useServices, useT } from "./context.js";
import { formatBytes } from "./format.js";
import { formatDuration, useAudioPlayer } from "./useAudio.js";
import { PhotoViewer } from "./PhotoViewer.js";
import { Item, PageHeader } from "./settings/kit.js";
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
        {loading && (
          <View style={{ alignItems: "center", gap: 14, paddingTop: items.length === 0 ? 72 : 36, paddingBottom: 24 }}>
            <Spinner size={48} />
            <Text style={{ fontSize: 14, fontFamily, color: colors.textSecondary }}>{t("media.requesting")}</Text>
          </View>
        )}
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
