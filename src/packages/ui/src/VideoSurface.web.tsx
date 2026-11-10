import { createElement } from "react";

/** The browser's own video element (hardware decoding, seeking, full-screen, volume): we only size and start it. */
export function VideoSurface(props: {
  uri: string;
  width: number;
  height: number;
  poster?: string | undefined;
  autoPlay?: boolean;
  onEnded?: (() => void) | undefined;
}) {
  return createElement("video", {
    src: props.uri,
    controls: true,
    autoPlay: !!props.autoPlay,
    playsInline: true,
    preload: "metadata",
    ...(props.poster ? { poster: props.poster } : {}),
    onEnded: props.onEnded,
    style: { width: props.width, height: props.height, background: "#000", display: "block", borderRadius: 4, outline: "none" },
  } as object);
}

/** Live camera preview: shows a MediaStream (mirrored, muted so the microphone does not echo). */
export function LivePreview(props: { stream: unknown; width: number; height: number }) {
  return createElement("video", {
    autoPlay: true,
    muted: true,
    playsInline: true,
    ref: (el: { srcObject: unknown } | null) => {
      if (el) el.srcObject = props.stream;
    },
    style: { width: props.width, height: props.height, background: "#000", display: "block", objectFit: "cover", transform: "scaleX(-1)", borderRadius: 12 },
  } as object);
}

/**
 * A call's picture and sound: plays a MediaStream, filling its box (`mirror` for my own camera). An element plays the sound too, so a voice
 * call (no picture) is heard through the same element; `muted` is for my own stream, which must not be played back to me.
 */
export function StreamView(props: { stream: unknown; muted?: boolean; mirror?: boolean; fit?: "cover" | "contain" }) {
  return createElement("video", {
    autoPlay: true,
    muted: !!props.muted,
    playsInline: true,
    ref: (el: { srcObject: unknown } | null) => {
      if (el && el.srcObject !== props.stream) el.srcObject = props.stream;
    },
    style: {
      width: "100%",
      height: "100%",
      background: "#000",
      display: "block",
      objectFit: props.fit ?? "cover",
      ...(props.mirror ? { transform: "scaleX(-1)" } : {}),
    },
  } as object);
}

/** The browser draws a stream itself (see StreamView above); only the phone registers a renderer. */
export function setStreamRenderer(_r: unknown): void {}

/** The browser plays a video itself (see VideoSurface above); only the phone registers a player. */
export function setVideoRenderer(_r: unknown): void {}
