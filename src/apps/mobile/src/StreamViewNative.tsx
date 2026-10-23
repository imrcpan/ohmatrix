import { createElement, type ReactElement } from "react";
import type { RtcLib } from "./webrtcCalls.js";

/** The view of react-native-webrtc, and the stream's address it draws from (the library's own types are larger than what is used here). */
interface RtcViewLib extends RtcLib {
  RTCView: unknown;
}
type Stream = { toURL(): string };

/**
 * Draws a call's stream with react-native-webrtc's own view (which plays the sound of a stream with no picture too). The library is read
 * by `load` the first time something is drawn, which is after a call has started: the app itself starts without touching the native module.
 */
export function streamRendererFrom(load: () => RtcViewLib) {
  return (props: { stream: unknown; muted?: boolean; mirror?: boolean; fit?: "cover" | "contain" }): ReactElement | null => {
    const stream = props.stream as Stream | undefined;
    if (!stream) return null;
    return createElement(load().RTCView as never, {
      streamURL: stream.toURL(),
      objectFit: props.fit ?? "cover",
      mirror: !!props.mirror,
      style: { width: "100%", height: "100%" },
    });
  };
}
