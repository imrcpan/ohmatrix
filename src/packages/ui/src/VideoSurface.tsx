import type React from "react";
import { Text, View } from "react-native";

/** Plays a video from `uri`. Native players are not wired up yet: this placeholder says so (the web build has the real one). */
export function VideoSurface(props: {
  uri: string;
  width: number;
  height: number;
  poster?: string | undefined;
  autoPlay?: boolean;
  onEnded?: (() => void) | undefined;
}) {
  return (
    <View style={{ width: props.width, height: props.height, alignItems: "center", justifyContent: "center", backgroundColor: "#000" }}>
      <Text style={{ color: "#FFF" }}>Video playback is not available on this platform yet.</Text>
    </View>
  );
}

/** Live camera preview (web only). */
export function LivePreview(_props: { stream: unknown; width: number; height: number }) {
  return null;
}

/** What draws a call's stream on a phone. The `ui` package does not know the native library: the app hands over its view once, at start. */
type StreamRenderer = (props: { stream: unknown; muted?: boolean; mirror?: boolean; fit?: "cover" | "contain" }) => React.ReactElement | null;
let renderStream: StreamRenderer | null = null;

/** The app registers how a stream is drawn (the phone: react-native-webrtc's own view, which also plays the sound). */
export function setStreamRenderer(r: StreamRenderer | null): void {
  renderStream = r;
}

/** A call's picture and sound, drawn by what the app registered (nothing, where nothing is). */
export function StreamView(props: { stream: unknown; muted?: boolean; mirror?: boolean; fit?: "cover" | "contain" }) {
  return renderStream ? renderStream(props) : null;
}
