import { useEventListener } from "expo";
import { useVideoPlayer, VideoView } from "expo-video";
import { createElement, type ReactElement } from "react";

/** What the viewer hands over for one video. */
export interface VideoProps {
  uri: string;
  width: number;
  height: number;
  autoPlay?: boolean;
  onEnded?: (() => void) | undefined;
}

/** The native player of expo-video, with the system's own controls (play, seek, full screen). */
export function VideoPlayer(props: VideoProps): ReactElement {
  const player = useVideoPlayer({ uri: props.uri }, (p) => {
    p.loop = false;
    if (props.autoPlay) p.play();
  });
  useEventListener(player, "playToEnd", () => props.onEnded?.());
  return createElement(VideoView, {
    player,
    nativeControls: true,
    contentFit: "contain",
    fullscreenOptions: { enable: true },
    style: { width: props.width, height: props.height, backgroundColor: "#000" },
  });
}
