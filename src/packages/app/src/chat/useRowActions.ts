import { useMemo } from "react";
import type { TimelineItem } from "@ohmatrix/core";
import type { OpenRoom } from "@ohmatrix/state";
import { useController, useServices } from "../context.js";
import type { RowActions } from "./rowActions.js";
import { useLatest } from "./useLatest.js";

/**
 * What a row may ask the chat to do. The object is created once and never changes (so rows that are not affected are
 * not redrawn); it reads the latest handle and callbacks through refs.
 */
export function useRowActions(opts: {
  handle: { readonly current: OpenRoom | null };
  startReply(item: TimelineItem): void;
  startEdit(item: TimelineItem): void;
  forward(item: TimelineItem): void;
  jump(eventId: string): void;
}): RowActions {
  const controller = useController();
  const services = useServices();
  const latest = useLatest({ ...opts, controller, services });
  return useMemo<RowActions>(
    () => ({
      react: (id, key) => void latest.current.handle.current?.react(id, key).catch(() => {}),
      reply: (item) => latest.current.startReply(item),
      edit: (item) => latest.current.startEdit(item),
      pin: (item, pinned) => void latest.current.handle.current?.pin(item.id, pinned).catch(() => {}),
      forward: (item) => latest.current.forward(item),
      download: (f) =>
        void latest.current.controller
          .resolveMedia(f.url, { ...(f.encryption ? { encryption: f.encryption } : {}), ...(f.mimeType && { mimeType: f.mimeType }) })
          .then((url) => latest.current.services.saveFile?.({ url, name: f.name }))
          .catch(() => {}),
      remove: (id) => void latest.current.handle.current?.redact(id).catch(() => {}),
      cancelUpload: (id) => latest.current.handle.current?.cancelUpload(id),
      jump: (id) => latest.current.jump(id),
    }),
    [latest],
  );
}
