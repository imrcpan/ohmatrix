import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, PanResponder, Pressable, Text, View } from "react-native";
import { ScaleRoot } from "./Scale.js";
import { useScale } from "./viewport.js";
import { useViewport } from "./viewport.js";
import { Icon, type IconName } from "./Icon.js";
import { fontFamily } from "./theme.js";

const MIN = 0.25;
const MAX = 8;
const STEP = 1.25;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Size an image is first shown at: it fits inside the window with a margin and is never blown up past its own size. */
export function fitSize(natural: { width: number; height: number }, area: { width: number; height: number }) {
  const k = Math.min(1, (area.width * 0.8) / natural.width, (area.height * 0.8) / natural.height);
  return { width: Math.round(natural.width * k), height: Math.round(natural.height * k) };
}

function Control(props: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      hitSlop={6}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? "rgba(255,255,255,0.28)" : hovered ? "rgba(255,255,255,0.18)" : "transparent",
      })}
    >
      <Icon name={props.icon} size={22} color="#FFFFFF" />
    </Pressable>
  );
}

/**
 * Photo viewer: covers the whole window with a translucent mask (the chat stays faintly visible behind it),
 * shows the picture at a comfortable size rather than maximised, and lets you zoom (buttons, wheel, double click)
 * and drag it around when zoomed. Click outside the picture, press Esc, or use the close button to leave.
 */
export function ImageViewer(props: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Sharp version (may arrive later than the first frame). */
  uri: string | undefined;
  /** Small version already in the chat, shown while the full one loads. */
  previewUri?: string | undefined;
  /** Known pixel size, if the message says it; otherwise measured once the image loads. */
  width?: number | undefined;
  height?: number | undefined;
  labels?: { close: string; zoomIn: string; zoomOut: string; fit: string };
}) {
  const win = useViewport();
  const uiScale = useScale();
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(
    props.width && props.height ? { width: props.width, height: props.height } : null,
  );
  const [ready, setReady] = useState(false);
  const labels = props.labels ?? { close: "Close", zoomIn: "Zoom in", zoomOut: "Zoom out", fit: "Fit to window" };

  useEffect(() => {
    if (props.visible) {
      setScale(1);
      setPan({ x: 0, y: 0 });
      setReady(false);
    }
  }, [props.visible, props.uri]);
  useEffect(() => {
    const doc = (
      globalThis as {
        document?: {
          addEventListener(t: string, f: (e: { key: string }) => void): void;
          removeEventListener(t: string, f: (e: { key: string }) => void): void;
        };
      }
    ).document;
    if (!props.visible || !doc) return;
    const onKey = (e: { key: string }) => {
      if (e.key === "Escape") props.onClose();
      else if (e.key === "+" || e.key === "=") zoom(STEP);
      else if (e.key === "-") zoom(1 / STEP);
      else if (e.key === "0") {
        setScale(1);
        setPan({ x: 0, y: 0 });
      }
    };
    doc.addEventListener("keydown", onKey);
    return () => doc.removeEventListener("keydown", onKey);
  });

  const zoom = (k: number) =>
    setScale((s) => {
      const n = clamp(s * k, MIN, MAX);
      if (n <= 1) setPan({ x: 0, y: 0 });
      return n;
    });
  const base = natural ? fitSize(natural, win) : { width: Math.round(win.width * 0.6), height: Math.round(win.height * 0.6) };

  const latest = useRef({ pan, scale });
  latest.current = { pan, scale };
  const start = useRef({ x: 0, y: 0 });
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => latest.current.scale > 1,
        onMoveShouldSetPanResponder: () => latest.current.scale > 1,
        onPanResponderGrant: () => {
          start.current = latest.current.pan;
        },
        onPanResponderMove: (_, g) => setPan({ x: start.current.x + g.dx, y: start.current.y + g.dy }),
      }),
    [],
  );

  const lastTap = useRef(0);
  const onImagePress = () => {
    const now = Date.now();
    if (now - lastTap.current < 320) {
      // double click / tap: fit <-> 2x
      if (latest.current.scale === 1) setScale(2);
      else {
        setScale(1);
        setPan({ x: 0, y: 0 });
      }
      lastTap.current = 0;
    } else lastTap.current = now;
  };

  return (
    <Modal transparent visible={props.visible} animationType="fade" onRequestClose={props.onClose}>
      <ScaleRoot scale={uiScale}>
        {/* The mask: dims what is behind instead of covering it with a flat colour. */}
        <Pressable
          accessibilityLabel="Viewer backdrop"
          onPress={props.onClose}
          {...({ onWheel: (e: { deltaY: number; preventDefault?: () => void }) => zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1) } as object)}
          style={[
            { flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
            { cursor: "default" } as object,
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Photo: ${props.title ?? ""}`}
            onPress={onImagePress}
            {...responder.panHandlers}
            style={[
              { width: base.width, height: base.height, transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }] },
              { cursor: scale > 1 ? "grab" : "zoom-in" } as object,
            ]}
          >
            {props.previewUri && !ready && (
              <Image source={{ uri: props.previewUri }} resizeMode="contain" style={{ position: "absolute", width: "100%", height: "100%" }} />
            )}
            {props.uri && (
              <Image
                source={{ uri: props.uri }}
                resizeMode="contain"
                style={{ width: "100%", height: "100%", opacity: ready ? 1 : 0 }}
                onLoad={(e) => {
                  const s = e.nativeEvent.source as { width?: number; height?: number } | undefined;
                  if (!natural && s?.width && s?.height) setNatural({ width: s.width, height: s.height });
                  setReady(true);
                }}
              />
            )}
            {!ready && !props.previewUri && (
              <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" } as object}>
                <ActivityIndicator color="#FFFFFF" />
              </View>
            )}
          </Pressable>

          <View style={{ position: "absolute", top: 16, right: 16 }}>
            <View style={{ borderRadius: 22, backgroundColor: "rgba(0,0,0,0.45)", padding: 3 }}>
              <Control icon="close" label={labels.close} onPress={props.onClose} />
            </View>
          </View>
          <Pressable
            onPress={() => {}}
            style={{
              position: "absolute",
              bottom: 22,
              flexDirection: "row",
              alignItems: "center",
              gap: 2,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 26,
              backgroundColor: "rgba(0,0,0,0.5)",
            }}
          >
            <Control icon="zoomOut" label={labels.zoomOut} onPress={() => zoom(1 / STEP)} />
            <Text accessibilityLabel="Zoom level" style={{ minWidth: 52, textAlign: "center", fontSize: 14, fontFamily, color: "#FFFFFF" }}>
              {Math.round(scale * 100)}%
            </Text>
            <Control icon="zoomIn" label={labels.zoomIn} onPress={() => zoom(STEP)} />
            <Control
              icon="fit"
              label={labels.fit}
              onPress={() => {
                setScale(1);
                setPan({ x: 0, y: 0 });
              }}
            />
          </Pressable>
        </Pressable>
      </ScaleRoot>
    </Modal>
  );
}
