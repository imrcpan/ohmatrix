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
      ? { onVoice: () => void voice.start(), onVideo: () => setRecordingVideo(true), voiceLabel: t("record.voice"), videoLabel: t("record.video") }
      : undefined,
    onAttach: services.pickFiles ? () => void services.pickFiles!().then((files) => files.forEach((f) => void sendFile(f))) : undefined,
  };
  return { sendFile, composerProps, dropping, pending, setPending, recordingVideo, setRecordingVideo };
}

export type Attachments = ReturnType<typeof useAttachments>;
