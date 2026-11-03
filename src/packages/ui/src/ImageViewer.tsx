import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Modal, PanResponder, Platform, Pressable, Text, View } from "react-native";
import { ScaleRoot } from "./Scale.js";
import { useInsets, useScale, useViewport } from "./viewport.js";
import { Icon, type IconName } from "./Icon.js";
import { fontFamily } from "./theme.js";
import { TopNotice } from "./TopNotice.js";
import { clamp, MAX, MIN, pinchedScale } from "./viewerMath.js";

const STEP = 1.25;
/** How long a tap on the dim waits for a second one before the viewer closes (ms). */
const CLOSE_DELAY = 300;
/** How long the zoom of a double tap takes (ms). */
const GLIDE_MS = 200;

/** Quick off the mark and slow to settle (a quintic ease-out): it moves at once, and the speed of a zoom is never constant. */
const ease = (k: number) => 1 - Math.pow(1 - k, 5);

/** Where something is in the window (px, as measured on the screen). */
export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How long the picture takes to grow from where it was in the chat to its place in the viewer, and back (ms). */
const OPEN_MS = 260;

/** Size an image is first shown at: it fits inside the window with a margin and is never blown up past its own size. */
export function fitSize(natural: { width: number; height: number }, area: { width: number; height: number }) {
  const k = Math.min(1, (area.width * 0.8) / natural.width, (area.height * 0.8) / natural.height);
  return { width: Math.round(natural.width * k), height: Math.round(natural.height * k) };
}

function Control(props: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: !!props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      hitSlop={6}
      style={({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => ({
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: "center",
        justifyContent: "center",
        opacity: props.disabled ? 0.4 : 1,
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
  /** A save button first in the toolbar: shown when given, dimmed while `disabled` (the picture is not there yet). */
  save?: { label: string; onPress: () => void; disabled?: boolean } | undefined;
  /** Where the picture was on the screen when it was pressed: it then grows from there to its place instead of fading in, and shrinks back to it on leaving. */
  origin?: ViewRect | undefined;
  /**
   * The desktop way (the desktop client, or the web in any landscape window): a click on the dim closes at once and a click on the picture does nothing (a double
   * click on it still zooms). The other way, a tap on either closes after a short wait, and two taps anywhere zoom.
   */
  desktop?: boolean | undefined;
  /** A short message above the toolbar, e.g. that the picture was saved. */
  notice?: string | undefined;
}) {
  // A Modal draws edge to edge: its corner controls must stay clear of the status bar and the navigation bar.
  const inset = useInsets();
  const win = useViewport();
  const uiScale = useScale();
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(
    props.width && props.height ? { width: props.width, height: props.height } : null,
  );
  const [ready, setReady] = useState(false);
  // 0 = the picture is where it was in the chat, 1 = in its place; with no origin it is always 1 and the Modal fades instead.
  const [open, setOpen] = useState(0);
  const p = props.origin ? open : 1;
  const labels = props.labels ?? { close: "Close", zoomIn: "Zoom in", zoomOut: "Zoom out", fit: "Fit to window" };

  useEffect(() => {
    if (props.visible) {
      setScale(1);
      setPan({ x: 0, y: 0 });
      setReady(false);
    }
  }, [props.visible, props.uri]);
  const moving = useRef(0);
  const moveTo = (to: number, then?: () => void) => {
    const id = ++moving.current;
    const from = latest.current.open;
    const t0 = Date.now();
    const step = () => {
      if (id !== moving.current) return;
      const k = Math.min(1, (Date.now() - t0) / OPEN_MS);
      const e = ease(k);
      setOpen(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
      else then?.();
    };
    requestAnimationFrame(step);
  };
  useEffect(() => {
    if (props.visible && props.origin) {
      latest.current.open = 0;
      setOpen(0);
      moveTo(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.visible]);
  // Leaving: back to where the picture was, then the parent hides the viewer.
  const closed = useRef(false);
  const close = () => {
    if (!props.origin) return props.onClose();
    if (closed.current) return;
    closed.current = true;
    moveTo(0, () => {
      closed.current = false;
      props.onClose();
    });
  };
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
      if (e.key === "Escape") close();
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

  const zoom = (k: number) => {
    stopGlide();
    setScale((s) => {
      const n = clamp(s * k, MIN, MAX);
      if (n <= 1) setPan({ x: 0, y: 0 });
      return n;
    });
  };
  const base = natural ? fitSize(natural, win) : { width: Math.round(win.width * 0.6), height: Math.round(win.height * 0.6) };

  // The picture starts out at the place and size it had in the chat (the layout is `uiScale` times smaller than the window).
  const o = props.origin;
  const fromOrigin =
    o && p < 1
      ? [
          { translateX: (1 - p) * ((o.x + o.width / 2) / uiScale - win.width / 2) },
          { translateY: (1 - p) * ((o.y + o.height / 2) / uiScale - win.height / 2) },
          { scale: Math.pow(o.width / uiScale / base.width, 1 - p) },
        ]
      : [];
  const latest = useRef({ pan, scale, open });
  latest.current = { pan, scale, open };
  const start = useRef({ x: 0, y: 0 });
  const pinch = useRef<{ distance: number; scale: number } | null>(null);
  const distanceOf = (touches: ReadonlyArray<{ pageX: number; pageY: number }>) =>
    Math.hypot(touches[0]!.pageX - touches[1]!.pageX, touches[0]!.pageY - touches[1]!.pageY);
  const responder = useMemo(() => {
    // Two fingers pinch; one finger drags a picture that is zoomed in. The capture phase takes the touch from the
    // picture's own press, so a pinch that begins on it still works.
    const wants = (touches: ReadonlyArray<unknown>) => touches.length >= 2 || latest.current.scale > 1;
    return PanResponder.create({
      onStartShouldSetPanResponderCapture: (e) => e.nativeEvent.touches.length >= 2,
      onMoveShouldSetPanResponderCapture: (e) => wants(e.nativeEvent.touches),
      onPanResponderGrant: (e) => {
        stopGlide();
        start.current = latest.current.pan;
        const t = e.nativeEvent.touches;
        pinch.current = t.length >= 2 ? { distance: distanceOf(t), scale: latest.current.scale } : null;
      },
      onPanResponderMove: (e, g) => {
        const t = e.nativeEvent.touches;
        if (t.length >= 2) {
          pinch.current ??= { distance: distanceOf(t), scale: latest.current.scale };
          setScale(pinchedScale(pinch.current.scale, pinch.current.distance, distanceOf(t)));
          return;
        }
        // One finger again after a pinch: carry on dragging from where the picture is now.
        if (pinch.current) {
          pinch.current = null;
          start.current = { x: latest.current.pan.x - g.dx, y: latest.current.pan.y - g.dy };
        }
        setPan({ x: start.current.x + g.dx, y: start.current.y + g.dy });
      },
      onPanResponderRelease: () => {
        pinch.current = null;
        if (latest.current.scale <= 1) setPan({ x: 0, y: 0 });
      },
      onPanResponderTerminate: () => {
        pinch.current = null;
      },
    });
  }, []);

  // The scale and the pan glide to their new values (a double tap, the Fit button) at a steady speed, frame by frame; a touch or a button
  // in the middle takes over. On the web the zoom is at once.
  const glide = useRef(0);
  const stopGlide = () => {
    glide.current++;
  };
  const glideTo = (toScale: number, toPan: { x: number; y: number }) => {
    const id = ++glide.current;
    if (Platform.OS === "web") {
      setScale(toScale);
      setPan(toPan);
      return;
    }
    const from = { scale: latest.current.scale, pan: latest.current.pan };
    const t0 = Date.now();
    const step = () => {
      if (id !== glide.current) return;
      const k = Math.min(1, (Date.now() - t0) / GLIDE_MS);
      // The scale moves by the same factor in equal times (a power, not a sum), which is what the eye takes for a steady zoom.
      setScale(from.scale * Math.pow(toScale / from.scale, k));
      setPan({ x: from.pan.x + (toPan.x - from.pan.x) * k, y: from.pan.y + (toPan.y - from.pan.y) * k });
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  // Two taps within 320 ms zoom (fit <-> 2x), wherever they land: on the picture or on the dim around it. A single tap, on either,
  // closes the viewer, so it waits CLOSE_DELAY to see whether a second one follows.
  const lastTap = useRef(0);
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closing.current) clearTimeout(closing.current);
    closing.current = null;
  };
  useEffect(() => cancelClose, []);
  const onTap = (onDim: boolean) => {
    const now = Date.now();
    if (props.desktop) {
      if (onDim) return close();
      if (now - lastTap.current < 320) {
        glideTo(latest.current.scale === 1 ? 2 : 1, latest.current.scale === 1 ? latest.current.pan : { x: 0, y: 0 });
        lastTap.current = 0;
      } else lastTap.current = now;
      return;
    }
    if (now - lastTap.current < 320) {
      cancelClose();
      if (latest.current.scale === 1) glideTo(2, latest.current.pan);
      else glideTo(1, { x: 0, y: 0 });
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
    closing.current = setTimeout(close, CLOSE_DELAY);
  };

  return (
    <Modal transparent visible={props.visible} animationType={props.origin ? "none" : "fade"} onRequestClose={close}>
      <ScaleRoot scale={uiScale}>
        {/* The touch responder is the outermost view: a responder can only be taken over by an ancestor, so were it inside
            the mask's Pressable, a pinch that begins on the bare mask (which holds the touch) would never reach it. */}
        <View {...responder.panHandlers} style={{ flex: 1 }}>
          {/* The mask: dims what is behind instead of covering it with a flat colour. */}
          <Pressable
            accessibilityLabel="Viewer backdrop"
            onPress={() => onTap(true)}
            {...({ onWheel: (e: { deltaY: number; preventDefault?: () => void }) => zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1) } as object)}
            style={[
              { flex: 1, backgroundColor: `rgba(0,0,0,${0.72 * p})`, alignItems: "center", justifyContent: "center", overflow: "hidden" },
              { cursor: "default" } as object,
            ]}
          >
            <View style={{ flex: 1, alignSelf: "stretch", alignItems: "center", justifyContent: "center" }}>
              <View
                style={[
                  { width: base.width, height: base.height, transform: [...fromOrigin, { translateX: pan.x }, { translateY: pan.y }, { scale }] },
                  { cursor: scale > 1 ? "grab" : "zoom-in" } as object,
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Photo: ${props.title ?? ""}`}
                  onPress={() => onTap(false)}
                  style={{ width: "100%", height: "100%" }}
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
              </View>

              <View style={{ position: "absolute", top: 16 + inset.top, right: 16 + inset.right, opacity: p }}>
                <View style={{ borderRadius: 22, backgroundColor: "rgba(0,0,0,0.45)", padding: 3 }}>
                  <Control icon="close" label={labels.close} onPress={close} />
                </View>
              </View>
              {!!props.notice && <TopNotice message={props.notice} top={56 + inset.top} />}
              <Pressable
                onPress={() => {}}
                style={{
                  position: "absolute",
                  bottom: 22 + inset.bottom,
                  opacity: p,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 2,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 26,
                  backgroundColor: "rgba(0,0,0,0.5)",
                }}
              >
                {props.save && <Control icon="download" label={props.save.label} onPress={props.save.onPress} disabled={!!props.save.disabled} />}
                <Control icon="zoomOut" label={labels.zoomOut} onPress={() => zoom(1 / STEP)} />
                <Text accessibilityLabel="Zoom level" style={{ minWidth: 52, textAlign: "center", fontSize: 14, fontFamily, color: "#FFFFFF" }}>
                  {Math.round(scale * 100)}%
                </Text>
                <Control icon="zoomIn" label={labels.zoomIn} onPress={() => zoom(STEP)} />
                <Control icon="fit" label={labels.fit} onPress={() => glideTo(1, { x: 0, y: 0 })} />
              </Pressable>
            </View>
          </Pressable>
        </View>
      </ScaleRoot>
    </Modal>
  );
}
