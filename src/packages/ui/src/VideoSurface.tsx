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
