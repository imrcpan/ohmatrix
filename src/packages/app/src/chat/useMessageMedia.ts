import { useState } from "react";
import type { TimelineItem } from "@ohmatrix/core";
import { useController } from "../context.js";
import { useAudioPlayer } from "../useAudio.js";
import { useMediaUrl } from "../useMedia.js";
import { decryptOpts } from "./mediaOpts.js";
import { fit, fitSticker } from "./mediaSize.js";

/**
 * Everything a message needs fetched or played: the sender's avatar, the picture or video poster, the link preview
 * picture, the audio player, and the sharp original or the video file once their viewers are open. Small things load
 * at once; the big ones (audio, the sharp original, the video file) only when asked for.
 */
export function useMessageMedia(m: TimelineItem) {
  const controller = useController();
  const c = m.content;
  const avatar = useMediaUrl(m.senderAvatar, { width: 64, height: 64, fit: "crop" });

  const [viewingImage, setViewingImage] = useState(false);
  const [viewingVideo, setViewingVideo] = useState(false);

  const imageDims = c.kind === "image" ? (c.sticker ? fitSticker(c.width, c.height) : fit(c.width, c.height)) : undefined;
  // A sticker is fetched whole: the server's thumbnail of an animation is one still frame.
  const image = useMediaUrl(
    c.kind === "image" ? c.url : undefined,
    imageDims ? (c.kind === "image" && c.sticker ? decryptOpts(c) : { width: imageDims.width * 2, height: imageDims.height * 2, ...decryptOpts(c) }) : {},
  );
  const original = useMediaUrl(viewingImage && c.kind === "image" ? c.url : undefined, decryptOpts(c));

  const videoDims = c.kind === "video" ? fit(c.width ?? 640, c.height ?? 360) : undefined;
  const thumb = c.kind === "video" ? c.thumbnail : undefined;
  const poster = useMediaUrl(
    thumb?.url,
    thumb ? { width: 400, height: 400, ...(thumb.encryption ? { encryption: thumb.encryption, mimeType: thumb.mimeType ?? "image/jpeg" } : {}) } : {},
  );
  const videoFile = useMediaUrl(viewingVideo && c.kind === "video" ? c.url : undefined, decryptOpts(c));

  // Link previews: at most two cards, and the first picture only.
  const previews = c.kind === "text" ? (c.previews ?? []).slice(0, 2) : [];
  const previewImage = useMediaUrl(previews.find((p) => p.image)?.image, { width: 400, height: 400, fit: "crop" });

  const audio = useAudioPlayer(
    () => (c.kind === "audio" ? controller.resolveMedia(c.url, decryptOpts(c)) : Promise.reject(new Error("not audio"))),
    c.kind === "audio" ? c.durationMs : undefined,
  );

  return {
    avatar,
    image,
    imageDims,
    original,
    videoDims,
    poster,
    videoFile,
    previews,
    previewImage,
    audio,
    viewingImage,
    setViewingImage,
    viewingVideo,
    setViewingVideo,
  };
}
