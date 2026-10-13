import { Pressable, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
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
          }}
        />
      ))}
    </View>
  );
}

/**
 * Audio inside a bubble: play/pause circle, then the waveform (voice messages) or the name with a thin progress bar
 * (audio files), and the time. Press the bar to jump.
 */
export function AudioRow(props: {
  own: boolean;
  voice: boolean;
  name: string;
  samples?: number[] | undefined;
  progress: number;
  playing: boolean;
  loading: boolean;
  timeLabel: string;
  playLabel: string;
  onToggle: () => void;
  onSeek: (fraction: number) => void;
  upload?: { progress: number; failed?: boolean | undefined; label: string; cancelLabel: string; onCancel: () => void } | undefined;
}) {
  const { colors } = useTheme();
  const fg = props.own ? colors.bubbleOutText : colors.bubbleInText;
  const meta = props.own ? colors.bubbleOutMeta : colors.textSecondary;
  const circle = props.own ? "rgba(255,255,255,0.24)" : colors.accent;
  const BAR = 150;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingRight: 6, paddingBottom: 14, minWidth: 220 }}>
      {props.upload ? (
        <ProgressRing
          progress={props.upload.progress}
          failed={props.upload.failed}
          onCancel={props.upload.onCancel}
          label={props.upload.cancelLabel}
          dark={!props.own}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={props.playLabel}
          accessibilityState={{ busy: props.loading }}
          onPress={props.onToggle}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: circle, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name={props.loading ? "clock" : props.playing ? "pause" : "play"} size={22} strokeWidth={2.4} color={colors.onAccent} />
        </Pressable>
      )}
      <View style={{ flexShrink: 1 }}>
        {props.voice ? (
          <Pressable
            accessibilityRole="adjustable"
            accessibilityLabel="Seek"
            onPress={(e) => {
              const x = (e.nativeEvent as { locationX?: number }).locationX;
              if (typeof x === "number") props.onSeek(Math.max(0, Math.min(1, x / BAR)));
            }}
          >
            <Waveform
              samples={props.samples}
              seed={props.name}
              progress={props.progress}
              played={props.own ? "#FFFFFF" : colors.accent}
              rest={props.own ? "rgba(255,255,255,0.45)" : colors.textTertiary}
              width={BAR}
            />
          </Pressable>
        ) : (
          <>
            <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: "500", fontFamily, color: fg }}>
              {props.name}
            </Text>
            <Pressable
              accessibilityRole="adjustable"
              accessibilityLabel="Seek"
              onPress={(e) => {
                const x = (e.nativeEvent as { locationX?: number }).locationX;
                if (typeof x === "number") props.onSeek(Math.max(0, Math.min(1, x / BAR)));
              }}
              style={{ height: 14, justifyContent: "center", width: BAR }}
            >
              <View style={{ height: 3, borderRadius: 1.5, backgroundColor: props.own ? "rgba(255,255,255,0.35)" : colors.textTertiary }}>
                <View
                  style={{
                    width: `${Math.round(props.progress * 100)}%`,
                    height: 3,
                    borderRadius: 1.5,
                    backgroundColor: props.own ? "#FFFFFF" : colors.accent,
                  }}
                />
              </View>
            </Pressable>
          </>
        )}
        <Text style={{ fontSize: 13, fontFamily, color: meta, marginTop: 2 }}>{props.upload ? props.upload.label : props.timeLabel}</Text>
      </View>
    </View>
  );
}
