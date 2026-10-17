import { useCallback, useEffect, useRef, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import type { MediaKind, TimelineItem } from "@ohmatrix/core";
import { fontFamily, Icon, TextButton, useTheme, VideoViewer } from "@ohmatrix/ui";
import { useController, useServices, useT } from "./context.js";
import { formatBytes } from "./format.js";
import { formatDuration, useAudioPlayer } from "./useAudio.js";
import { PhotoViewer } from "./PhotoViewer.js";
import { Group, Item } from "./settings/kit.js";
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

/** One audio file or voice message, playable in place. */
function AudioItem(props: { item: TimelineItem }) {
  const t = useT();
  const controller = useController();
  const c = props.item.content as Content<"audio">;
  const audio = useAudioPlayer(() => controller.resolveMedia(c.url, enc(c)), c.durationMs);
  const playing = audio.state.status === "playing";
  return (
    <Item
      label={c.voice ? t("voiceMessage") : c.name}
      subtitle={`${props.item.senderName} · ${playing ? `${formatDuration(audio.state.positionMs)} / ` : ""}${formatDuration(audio.state.durationMs) || formatBytes(c.size)}`}
      icon={playing ? "pause" : "play"}
      chevron={false}
      onPress={() => void audio.toggle()}
    />
  );
}

/**
 * A room's shared media, in tabs by kind. Each tab reaches back through the room's whole history a page at a time
 * (not only what the chat has loaded), shows pictures and videos as a grid and audio and files as a list, and opens
 * pictures and videos in the same viewers the chat uses.
 */
export function SharedMedia(props: { roomId: string }) {
  const t = useT();
  const { colors } = useTheme();
  const controller = useController();
  const services = useServices();
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

  // A new room starts empty; the first look at a tab loads its first page.
  useEffect(() => {
    setLists({});
    setKind("image");
  }, [props.roomId]);
  useEffect(() => {
    if (!lists[kind] && !busy.current) void more(kind);
  }, [kind, lists, more]);

  const items = list?.items ?? [];
  const grid = kind === "image" || kind === "video";
  const tile = Math.max(60, Math.floor((width - 36 - 12) / 3));

  // The picture or video being looked at, with the viewers the chat uses.
  const vc = viewing?.content;
  const full = useMediaUrl(viewing && vc && (vc.kind === "image" || vc.kind === "video") ? vc.url : undefined, vc && "encryption" in vc ? enc(vc) : {});
  const poster = useMediaUrl(vc?.kind === "video" ? vc.thumbnail?.url : undefined, vc?.kind === "video" && vc.thumbnail ? { width: 400, height: 400 } : {});

  return (
    <Group title={t("sharedMedia")}>
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
            <Item
              key={i.id}
              label={i.content.name}
              subtitle={`${i.senderName}${i.content.size ? ` · ${formatBytes(i.content.size)}` : ""}`}
              icon="file"
              chevron={false}
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
      {vc?.kind === "image" && (
        <PhotoViewer visible onClose={() => setViewing(null)} title={vc.body} fileName={vc.body} uri={full} width={vc.width} height={vc.height} />
      )}
      {vc?.kind === "video" && (
        <VideoViewer visible onClose={() => setViewing(null)} uri={full} poster={poster} width={vc.width} height={vc.height} closeLabel={t("viewer.close")} />
      )}
    </Group>
  );
}
