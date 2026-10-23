import { ConfirmDialog } from "../ConfirmDialog.js";
import { useNotice } from "../useNotice.js";
import { useT } from "../context.js";
import { VideoRecorderDialog } from "../Recording.js";
import { SendFilesDialog } from "../SendFilesDialog.js";
import type { Attachments } from "./useAttachments.js";

/** The dialogs of `useAttachments`: confirm what was dropped or pasted, and record a video. */
export function AttachmentDialogs({ a }: { a: Attachments }) {
  const t = useT();
  const notice = useNotice();
  const kind = a.callAsk;
  return (
    <>
      <ConfirmDialog
        visible={kind !== null}
        title={kind === "video" ? t("call.video.ask") : t("call.voice.ask")}
        message={t("call.ask.body")}
        confirmLabel={kind === "video" ? t("call.video.start") : t("call.voice.start")}
        onConfirm={() => {
          a.setCallAsk(null);
          notice.show(t("call.soon"));
        }}
        onClose={() => a.setCallAsk(null)}
      />
      <SendFilesDialog
        files={a.pending}
        onCancel={() => a.setPending([])}
        onSend={() => {
          a.pending.forEach((f) => void a.sendFile(f));
          a.setPending([]);
        }}
      />
      <VideoRecorderDialog visible={a.recordingVideo} onClose={() => a.setRecordingVideo(false)} send={a.sendFile} />
    </>
  );
}
