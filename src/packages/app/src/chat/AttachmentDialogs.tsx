import { VideoRecorderDialog } from "../Recording.js";
import { SendFilesDialog } from "../SendFilesDialog.js";
import type { Attachments } from "./useAttachments.js";

/** The dialogs of `useAttachments`: confirm what was dropped or pasted, and record a video. */
export function AttachmentDialogs({ a }: { a: Attachments }) {
  return (
    <>
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
