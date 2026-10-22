import type { ComponentProps } from "react";
import { contentText, type TimelineItem } from "@ohmatrix/core";
import type { Locale } from "@ohmatrix/i18n";
import type { Bubble } from "@ohmatrix/ui";
import type { Run } from "@ohmatrix/ui";
import { formatBytes, formatClock } from "../format.js";
import type { AudioState } from "../useAudio.js";
import { formatDuration } from "../useAudio.js";
import type { RowActions } from "./rowActions.js";
import type { Translate } from "./types.js";

export type BubbleProps = ComponentProps<typeof Bubble>;

/** What the bubble needs besides the message itself: media already resolved to URLs, and ways to open things. */
export interface BubbleInputs {
  item: TimelineItem;
  /** The message is pinned in the room (not `item.pinned`, see `PinnedContext`). */
  pinned: boolean;
  first: boolean;
  last: boolean;
  /** The bubble above / below is a plain text bubble too, and this one is: the corners that touch are tight. */
  stickAbove: boolean;
  stickBelow: boolean;
  /** A group chat shows who wrote each message; a one-to-one chat does not. */
  showAvatar: boolean;
  t: Translate;
  locale: Locale;
  actions: RowActions;
  runs: readonly Run[] | undefined;
  openLink(url: string): void;
  image: { uri: string | undefined; width: number; height: number } | undefined;
  video: { poster: string | undefined; width: number; height: number } | undefined;
  audio: { state: AudioState; toggle(): void };
  previews: { url: string; title?: string; description?: string; siteName?: string; image?: string; imageWidth?: number; imageHeight?: number }[];
  previewImageUrl: string | undefined;
  openImage(): void;
  openVideo(): void;
}

/** The text the bubble shows for a message: nothing for media (they have their own parts), a notice when undecryptable. */
export function bubbleText(item: TimelineItem, t: Translate): string {
  const c = item.content;
  if (c.kind === "image" || c.kind === "file" || c.kind === "video" || c.kind === "audio") return "";
  if (c.kind === "undecryptable") return t("undecryptable");
  return contentText(c);
}

/** Own messages show a double check once somebody has read them. */
export function bubbleStatus(item: TimelineItem): BubbleProps["status"] {
  if (!item.isOwn) return undefined;
  return item.readBy?.length && item.status === "sent" ? "read" : item.status;
}

/** Everything the `Bubble` component is given for one message. */
export function bubbleProps(i: BubbleInputs): BubbleProps {
  const { item: m, t, actions } = i;
  const c = m.content;
  const upload = m.upload;
  const firstWithImage = i.previews.find((p) => p.image)?.image;
  return {
    own: m.isOwn,
    text: bubbleText(m, t),
    time: formatClock(m.ts, i.locale),
    status: bubbleStatus(m),
    onRetry: m.status === "failed" && m.transactionId && !upload ? () => actions.resend(m.transactionId!) : undefined,
    retryLabel: t("resend.failed"),
    readLabel: m.readBy?.length ? t("readBy", { names: m.readBy.map((r) => r.name).join(", ") }) : undefined,
    // A file card stands alone and carries no name.
    senderName: i.showAvatar && i.first && c.kind !== "file" ? m.senderName : undefined,
    stuck: { above: i.stickAbove, below: i.stickBelow },
    senderId: m.sender,
    image: i.image
      ? {
          uri: upload?.previewUrl ?? i.image.uri,
          width: i.image.width,
          height: i.image.height,
          onPress: upload ? undefined : i.openImage,
          ...(c.kind === "image" && c.sticker && { sticker: true }),
        }
      : undefined,
    video:
      i.video && c.kind === "video"
        ? {
            posterUri: upload?.previewUrl ?? i.video.poster,
            width: i.video.width,
            height: i.video.height,
            durationLabel: formatDuration(c.durationMs) || undefined,
            onPress: i.openVideo,
          }
        : undefined,
    audio:
      c.kind === "audio"
        ? {
            voice: !!c.voice,
            name: c.name,
            samples: c.waveform,
            progress: i.audio.state.progress,
            timeLabel:
              i.audio.state.status === "idle"
                ? formatDuration(i.audio.state.durationMs)
                : `${formatDuration(i.audio.state.positionMs)} / ${formatDuration(i.audio.state.durationMs)}`,
            playLabel: i.audio.state.status === "playing" ? t("pause") : t("play"),
            onToggle: i.audio.toggle,
          }
        : undefined,
    upload: upload
      ? {
          progress: upload.progress,
          failed: upload.failed,
          cancelLabel: t(upload.failed ? "upload.dismiss" : "upload.cancel"),
          label: upload.failed ? t("upload.failed") : `${formatBytes(upload.loaded)} / ${formatBytes(upload.total)}`,
          onCancel: () => actions.cancelUpload(m.transactionId ?? ""),
        }
      : undefined,
    file: c.kind === "file" ? { name: c.name, sizeLabel: formatBytes(c.size), onPress: () => actions.download(c) } : undefined,
    reply: m.replyTo
      ? {
          senderName: m.replyTo.senderName,
          senderId: m.replyTo.sender,
          preview: m.replyTo.preview,
          onPress: () => actions.jump(m.replyTo!.id),
        }
      : undefined,
    runs: i.runs,
    // Only the first picture is resolved (one fetch per message); a second card shows its text without an image.
    previews: i.previews.map((p, n) => ({
      key: `${p.url}-${n}`,
      url: p.url,
      title: p.title,
      description: p.description,
      siteName: p.siteName,
      image: p.image && p.image === firstWithImage ? i.previewImageUrl : undefined,
      imageWidth: p.imageWidth,
      imageHeight: p.imageHeight,
    })),
    onOpenLink: i.openLink,
    onLink: i.openLink,
    mentionsMe: c.kind === "text" && c.mentionsMe,
    pinned: i.pinned,
    editedLabel: m.edited ? t("edited") : undefined,
    muted: c.kind === "unsupported" || c.kind === "undecryptable",
  };
}
