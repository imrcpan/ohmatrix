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
