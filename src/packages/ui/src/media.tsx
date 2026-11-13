import { Image, Pressable, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { Icon } from "./Icon.js";
import { fontFamily, useTheme } from "./theme.js";

/** Round progress indicator with a cancel cross inside (an alert mark when the upload failed). */
export function ProgressRing(props: { progress: number; size?: number; failed?: boolean | undefined; onCancel: () => void; label: string; dark?: boolean }) {
  const { colors } = useTheme();
  const size = props.size ?? 44;
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const p = Math.max(0.04, Math.min(1, props.progress)); // never an empty ring: the upload has started
  const ink = props.failed ? colors.danger : "#FFFFFF";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityValue={{ now: Math.round(props.progress * 100), min: 0, max: 100 }}
      onPress={props.onCancel}
      hitSlop={6}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: props.dark === false ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.5)",
      }}
    >
      {!props.failed && (
        <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.28)" strokeWidth={3} fill="none" />
          <Circle cx={size / 2} cy={size / 2} r={r} stroke="#FFFFFF" strokeWidth={3} fill="none" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} />
        </Svg>
      )}
      <Icon name={props.failed ? "alert" : "close"} size={size * 0.42} strokeWidth={2.4} color={ink} />
    </Pressable>
  );
}

/** Bars of a voice message; the played part is drawn in the strong colour. A missing waveform gets a gentle fixed pattern. */
export function Waveform(props: {
  samples?: number[] | undefined;
  seed: string;
  progress: number;
  played: string;
  rest: string;
  /** How much of its colour the bars not yet played keep. */
  restOpacity?: number | undefined;
  width: number;
  height?: number;
}) {
  const h = props.height ?? 26;
  const count = Math.max(12, Math.floor(props.width / 5));
  const bars = Array.from({ length: count }, (_, i) => {
    if (props.samples?.length) return props.samples[Math.min(props.samples.length - 1, Math.floor((i / count) * props.samples.length))] ?? 0;
    let x = 0;
    for (const ch of props.seed) x = (x * 31 + ch.charCodeAt(0)) >>> 0;
    return 0.25 + 0.55 * Math.abs(Math.sin((i + 1) * 1.7 + x));
  });
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2, height: h, width: props.width }}>
      {bars.map((v, i) => (
        <View
          key={i}
          style={{
            width: 3,
            borderRadius: 1.5,
            height: Math.max(3, Math.round(v * h)),
            backgroundColor: i / count < props.progress ? props.played : props.rest,
            opacity: i / count < props.progress ? 1 : (props.restOpacity ?? 1),
          }}
        />
      ))}
    </View>
  );
}

/** Width of the content of an audio bubble, the same for every one. */
const AUDIO_WIDTH = 220;

/**
 * Audio inside a bubble: the waveform (voice messages) or the name with a thin progress bar (audio files), and the
 * time. There is no play button and no seeking: pressing the bubble plays and pauses it, so the row is only drawn. While
 * a file is still going up, its progress ring stands where a button would, since it can be cancelled.
 */
export function AudioRow(props: {
  own: boolean;
  voice: boolean;
  name: string;
  samples?: number[] | undefined;
  progress: number;
  timeLabel: string;
  upload?: { progress: number; failed?: boolean | undefined; label: string; cancelLabel: string; onCancel: () => void } | undefined;
}) {
  const { colors } = useTheme();
  const fg = props.own ? colors.bubbleOutText : colors.bubbleInText;
  const meta = props.own ? colors.bubbleOutMeta : colors.textSecondary;
  // Every audio bubble is the same width and the waveform (or the bar) runs the whole of it; a ring still going up takes
  // its own share from the left.
  const BAR = props.upload ? AUDIO_WIDTH - 38 - 10 : AUDIO_WIDTH;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, width: AUDIO_WIDTH }}>
      {props.upload && (
        <ProgressRing
          size={38}
          progress={props.upload.progress}
          failed={props.upload.failed}
          onCancel={props.upload.onCancel}
          label={props.upload.cancelLabel}
          dark={!props.own}
        />
      )}
      <View style={{ width: BAR }}>
        {props.voice ? (
          <Waveform samples={props.samples} seed={props.name} progress={props.progress} played={fg} rest={fg} restOpacity={0.5} width={BAR} />
        ) : (
          <>
            <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "500", fontFamily, color: fg }}>
              {props.name}
            </Text>
            <View style={{ height: 10, justifyContent: "center", width: BAR }}>
              <View style={{ height: 3 }}>
                {/* The bar and what is played are the colour of the text; what is not played is half of it. */}
                <View style={{ position: "absolute", left: 0, right: 0, height: 3, borderRadius: 1.5, backgroundColor: fg, opacity: 0.5 }} />
                <View style={{ width: `${Math.round(props.progress * 100)}%`, height: 3, borderRadius: 1.5, backgroundColor: fg }} />
              </View>
            </View>
          </>
        )}
        <Text style={{ fontSize: 12, fontFamily, color: meta, marginTop: 1, paddingRight: props.own ? 62 : 44 }}>
          {props.upload ? props.upload.label : props.timeLabel}
        </Text>
      </View>
    </View>
  );
}

/**
 * A link preview card (Telegram-style): a thumbnail on the left, the site name, title and
 * description on the right. The server fetched the open-graph data; we only render it.
 */
export function LinkPreviewCard(props: {
  title?: string | undefined;
  description?: string | undefined;
  siteName?: string | undefined;
  /** Resolved thumbnail URL. */
  image?: string | undefined;
  imageWidth?: number | undefined;
  imageHeight?: number | undefined;
  /** The URL the card points at, shown when there is no title. */
  url: string;
  own: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const text = props.own ? colors.bubbleOutText : colors.bubbleInText;
  const meta = props.own ? colors.bubbleOutMeta : colors.textSecondary;
  const host = (() => {
    try {
      return new URL(props.url).host.replace(/^www\./, "");
    } catch {
      return props.url;
    }
  })();
  const shown = props.title ?? props.description ?? host;
  // A small square thumb next to the text, or a wide banner above it when the image is large.
  const wide = !!props.image && !!props.imageWidth && !!props.imageHeight && props.imageWidth >= props.imageHeight * 1.6;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Preview of ${shown}`}
      onPress={props.onPress}
      style={({ pressed }: { pressed: boolean }) => ({
        marginTop: 6,
        marginBottom: 2,
        borderRadius: 10,
        overflow: "hidden",
        backgroundColor: props.own ? "rgba(255,255,255,0.14)" : colors.bgSecondary,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {wide && <Image source={{ uri: props.image }} style={{ width: "100%", height: 140, backgroundColor: colors.bgSecondary }} resizeMode="cover" />}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {!!props.image && !wide && (
          <Image source={{ uri: props.image }} style={{ width: 56, height: 56, backgroundColor: colors.bgSecondary }} resizeMode="cover" />
        )}
        <View style={{ flex: 1, paddingHorizontal: wide ? 10 : 0, paddingVertical: 8, paddingRight: 10, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 13, fontFamily, color: meta }}>
            {props.siteName ?? host}
          </Text>
          {!!props.title && (
            <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: "600", fontFamily, color: text }}>
              {props.title}
            </Text>
          )}
          {!!props.description && (
            <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 17, fontFamily, color: meta }}>
              {props.description}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

/** What a file's extension says about its kind: the tile's colour (the families a chat app tells apart at a glance). */
function tileColor(ext: string): string {
  if (ext === "pdf") return "#E5483E";
  if (/^(docx?|rtf|pages|odt)$/.test(ext)) return "#2F6FDE";
  if (/^(xlsx?|csv|numbers|ods)$/.test(ext)) return "#1F9D57";
  if (/^(pptx?|key|odp)$/.test(ext)) return "#E8762B";
  if (/^(zip|rar|7z|tar|gz|tgz|bz2|xz)$/.test(ext)) return "#E0A21C";
  if (/^(mp3|m4a|aac|ogg|opus|wav|flac)$/.test(ext)) return "#8A63D2";
  if (/^(mp4|mov|mkv|avi|webm)$/.test(ext)) return "#D6477F";
  if (/^(apk|ipa|exe|dmg|msi|deb|rpm)$/.test(ext)) return "#3FA34D";
  return "#8E8E93";
}

/** A sheet of paper with a folded corner and the file's extension on it, as file cards show a file's kind. */
export function FileTile(props: { name: string; width?: number; height?: number }) {
  const w = props.width ?? 36,
    h = props.height ?? 44;
  const dot = props.name.lastIndexOf(".");
  const ext = dot > 0 && dot < props.name.length - 1 ? props.name.slice(dot + 1).toLowerCase() : "";
  const label = ext.slice(0, 4).toUpperCase();
  return (
    <View style={{ width: w, height: h }}>
      <Svg width={w} height={h} viewBox="0 0 36 44">
        <Path d="M4 0h19l13 13v27a4 4 0 01-4 4H4a4 4 0 01-4-4V4a4 4 0 014-4z" fill={tileColor(ext)} />
        <Path d="M23 0l13 13h-9a4 4 0 01-4-4z" fill="rgba(255,255,255,0.42)" />
      </Svg>
      {!!label && (
        <Text
          numberOfLines={1}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 6,
            textAlign: "center",
            fontSize: label.length > 3 ? 9 : 11,
            fontWeight: "700",
            fontFamily,
            color: "#FFFFFF",
          }}
        >
          {label}
        </Text>
      )}
    </View>
  );
}
