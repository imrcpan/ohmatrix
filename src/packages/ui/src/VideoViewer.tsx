import { useEffect } from "react";
import { ActivityIndicator, Modal, Platform, Pressable, View } from "react-native";
import { ScaleRoot } from "./Scale.js";
import { useScale } from "./viewport.js";
import { useInsets, useViewport } from "./viewport.js";
import { Icon } from "./Icon.js";
import { VideoSurface } from "./VideoSurface.js";

/**
 * Video player overlay: the same translucent mask as the photo viewer over the whole window, the video at a
 * comfortable size (never enlarged past its own, at most 80% of the window) with the browser's controls; on a phone, the whole window.
 * Click outside, Esc or the cross to leave.
 */
export function VideoViewer(props: {
  visible: boolean;
  onClose: () => void;
  uri: string | undefined;
  poster?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  closeLabel?: string;
}) {
  const win = useViewport();
  const scale = useScale();
  const natural = { width: props.width ?? 640, height: props.height ?? 360 };
  const k = Math.min(1, (win.width * 0.8) / natural.width, (win.height * 0.8) / natural.height);
  // On a phone the video has no small mode: it takes the whole window (the player fits the picture into it), turning with the phone.
  const phone = Platform.OS === "android" || Platform.OS === "ios";
  const insets = useInsets();
  const size = phone ? { width: win.width, height: win.height } : { width: Math.round(natural.width * k), height: Math.round(natural.height * k) };

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
    };
    doc.addEventListener("keydown", onKey);
    return () => doc.removeEventListener("keydown", onKey);
  }, [props.visible, props.onClose]);

  return (
    <Modal transparent visible={props.visible} animationType="fade" onRequestClose={props.onClose}>
      <ScaleRoot scale={scale}>
        <Pressable
          accessibilityLabel="Viewer backdrop"
          onPress={props.onClose}
          style={[{ flex: 1, backgroundColor: "rgba(0,0,0,0.72)", alignItems: "center", justifyContent: "center" }, { cursor: "default" } as object]}
        >
          <Pressable onPress={() => {}} style={{ width: size.width, height: size.height, alignItems: "center", justifyContent: "center" }}>
            {props.uri ? (
              <VideoSurface uri={props.uri} width={size.width} height={size.height} poster={props.poster} autoPlay />
            ) : (
              <ActivityIndicator color="#FFFFFF" />
            )}
          </Pressable>
          <View
            style={{
              position: "absolute",
              top: 16 + (phone ? insets.top : 0),
              right: 16 + (phone ? insets.right : 0),
              borderRadius: 22,
              backgroundColor: "rgba(0,0,0,0.45)",
              padding: 3,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={props.closeLabel ?? "Close"}
              onPress={props.onClose}
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
              <Icon name="close" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        </Pressable>
      </ScaleRoot>
    </Modal>
  );
}
