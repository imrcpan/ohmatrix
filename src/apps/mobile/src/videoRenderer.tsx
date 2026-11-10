import { Component, createElement, type ReactElement, type ReactNode } from "react";
import { Text, View } from "react-native";
import type { VideoProps } from "./VideoPlayerNative.js";

/** The player component; read by `load` when a video is first drawn, so the app starts without touching the native module. */
type Player = (props: VideoProps) => ReactElement;

/**
 * The player is a native module. An app built before it was added does not have it, and loading it throws; this keeps that to the
 * video (a line saying so) instead of the whole screen.
 */
export class VideoFallback extends Component<{ width: number; height: number; children?: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return createElement(
      View,
      { style: { width: this.props.width, height: this.props.height, alignItems: "center", justifyContent: "center", backgroundColor: "#000" } },
      createElement(Text, { style: { color: "#FFF" } }, "Video playback needs a newer build of the app."),
    );
  }
}

/** Draws a video with the player `load` gives, and says so on screen if the app has no such native module. */
export function videoRendererFrom(load: () => Player) {
  return (props: VideoProps & { poster?: string | undefined }): ReactElement =>
    createElement(VideoFallback, { width: props.width, height: props.height }, createElement(load(), props));
}
