import { useCallback, useEffect, useState } from "react";
import type { AttachmentSource } from "@ohmatrix/core";
import type { OpenRoom } from "@ohmatrix/state";
import { useServices } from "../context.js";
import { useVoiceRecording } from "../Recording.js";
import type { ComposerProps } from "./useComposer.js";
import type { Translate } from "./types.js";

/**
 * Everything that sends a file: the attach button, files dropped on the window or pasted (held until the user
 * confirms), and voice and video recording. Returns the props the `Composer` needs for the buttons and the state
 * the dialogs show.
 */
export function useAttachments(handle: { readonly current: OpenRoom | null }, t: Translate) {
  const services = useServices();
  const [failed, setFailed] = useState(false);
  // The panel under the bar with the attach buttons: open or not, kept here so that a tap on the chat can close it.
  const [attachPanel, setPanel] = useState(false);
  const [emojiPanel, setEmojiPanel] = useState(false);
  // Which call the person asked for and has yet to confirm.
  const [callAsk, setCallAsk] = useState<"voice" | "video" | null>(null);
  const panel = attachPanel || emojiPanel;
  useEffect(() => {
    if (!failed) return;
    const timer = setTimeout(() => setFailed(false), 5000);
    return () => clearTimeout(timer);
  }, [failed]);
  // A file that could not go out says so (the composer's notice line), rather than just not appearing.
  const sendFile = useCallback((f: AttachmentSource) => handle.current?.sendAttachment(f).catch(() => setFailed(true)) ?? Promise.resolve(), [handle]);
  const voice = useVoiceRecording(sendFile, services, t);
  const [recordingVideo, setRecordingVideo] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [pending, setPending] = useState<AttachmentSource[]>([]);
  useEffect(() => services.receiveFiles?.((files) => setPending((p) => [...p, ...files]), setDropping), [services]);

  const composerProps: Partial<ComposerProps> = {
    notice: voice.notice ?? (failed ? t("attach.failed") : undefined),
    recording: voice.bar,
    record: services.recordMedia
      ? {
          onVoice: () => void voice.start(),
          ...(!services.recordKinds || services.recordKinds.includes("video") ? { onVideo: () => setRecordingVideo(true), videoLabel: t("record.video") } : {}),
          voiceLabel: t("record.voice"),
        }
      : undefined,
    attach: {
      label: t("attach.label"),
      open: attachPanel,
      onOpenChange: setPanel,
      items: [
        ...(services.pickPhoto || services.pickFiles
          ? [
              {
                key: "image",
                icon: "fluentImage" as const,
                label: t("attach.image"),
                // The system's photo picker where there is one; otherwise the file chooser.
                onPress: () =>
                  void (services.pickPhoto
                    ? services.pickPhoto().then((f) => (f ? sendFile(f) : undefined))
                    : services.pickFiles!().then((files) => files.forEach((f) => void sendFile(f)))),
              },
            ]
          : []),
        ...(services.pickFiles
          ? [
              {
                key: "file",
                icon: "fluentDocument" as const,
                label: t("attach.file"),
                onPress: () => void services.pickFiles!().then((files) => files.forEach((f) => void sendFile(f))),
              },
            ]
          : []),
        // Calls are not there yet: the buttons say so rather than being left out.
        { key: "voiceCall", icon: "fluentCall" as const, label: t("call.voice"), onPress: () => setCallAsk("voice") },
        { key: "videoCall", icon: "fluentVideo" as const, label: t("call.video"), onPress: () => setCallAsk("video") },
      ],
    },
  };
  return {
    sendFile,
    composerProps,
    panel,
    closePanel: () => {
      setPanel(false);
      setEmojiPanel(false);
    },
    emoji: { open: emojiPanel, onChange: setEmojiPanel },
    callAsk,
    setCallAsk,
    dropping,
    pending,
    setPending,
    recordingVideo,
    setRecordingVideo,
  };
}

export type Attachments = ReturnType<typeof useAttachments>;
