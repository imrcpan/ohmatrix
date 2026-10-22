import { useMemo } from "react";
import { EngineError, type TimelineItem } from "@ohmatrix/core";
import type { OpenRoom } from "@ohmatrix/state";
import { failureReason } from "../avatarFailure.js";
import { useController, useServices, useT } from "../context.js";
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
  select(item: TimelineItem): void;
  forward(item: TimelineItem): void;
  jump(eventId: string): void;
  /** Say, at the top of the chat, that something did not work. */
  fail(message: string): void;
  /** Say, at the top of the screen, that something worked. */
  done(message: string): void;
}): RowActions {
  const controller = useController();
  const services = useServices();
  const t = useT();
  const latest = useLatest({ ...opts, controller, services, t });
  return useMemo<RowActions>(
    () => ({
      react: (id, key) => void latest.current.handle.current?.react(id, key).catch(() => {}),
      reply: (item) => latest.current.startReply(item),
      edit: (item) => latest.current.startEdit(item),
      select: (item) => latest.current.select(item),
      pin: (item, pinned) =>
        void latest.current.handle.current?.pin(item.id, pinned).then(
          () => latest.current.done(latest.current.t(pinned ? "pin.done" : "unpin.done")),
          (e: unknown) => {
            const { t, fail } = latest.current;
            fail(t(pinned ? "pin.failed" : "unpin.failed", { reason: failureReason(e, t) }));
          },
        ),
      forward: (item) => latest.current.forward(item),
      addSticker: (item, groupId) => {
        const c = item.content;
        if (c.kind !== "image") return;
        const { controller, t, fail, done } = latest.current;
        void (async () => {
          try {
            const name = c.body || "sticker";
            const mimeType = c.mimeType ?? "image/png";
            if (!c.encryption) {
              await controller.addStickerFrom(
                {
                  url: c.url,
                  mimeType,
                  name,
                  ...(c.width !== undefined && { width: c.width }),
                  ...(c.height !== undefined && { height: c.height }),
                },
                groupId,
              );
            } else {
              // A picture of an encrypted room is only readable with its keys: it is opened here and put on the server again, as a plain one.
              const url = await controller.resolveMedia(c.url, { encryption: c.encryption, mimeType });
              const blob = await (await fetch(url)).blob();
              const web = (globalThis as { document?: unknown }).document !== undefined;
              await controller.addSticker(
                {
                  name,
                  mimeType,
                  size: blob.size,
                  data: web ? blob : url,
                  ...(c.width !== undefined && { width: c.width }),
                  ...(c.height !== undefined && { height: c.height }),
                },
                groupId,
              );
            }
            done(t("sticker.added"));
          } catch (e) {
            fail(t("sticker.add.failed", { reason: failureReason(e, t) }));
          }
        })();
      },
      download: (f) =>
        void latest.current.controller
          .resolveMedia(f.url, { ...(f.encryption ? { encryption: f.encryption } : {}), ...(f.mimeType && { mimeType: f.mimeType }) })
          .then((url) => latest.current.services.saveFile?.({ url, name: f.name }))
          .catch((e: unknown) => {
            const code = e instanceof EngineError ? e.code : "unknown";
            const { t, fail } = latest.current;
            fail(t(code === "not_found" ? "file.missing" : code === "network" ? "file.offline" : "file.failed"));
          }),
      remove: (id) => void latest.current.handle.current?.redact(id).catch(() => {}),
      cancelUpload: (id) => latest.current.handle.current?.cancelUpload(id),
      resend: (id) => void latest.current.handle.current?.resend(id).catch(() => {}),
      discard: (id) => latest.current.handle.current?.discard(id),
      jump: (id) => latest.current.jump(id),
    }),
    [latest],
  );
}
