import { useEffect, useState } from "react";
import type { MxcUri } from "@ohmatrix/core";
import { ImageViewer } from "@ohmatrix/ui";
import { useServices, useT } from "./context.js";
import { avatarFileName } from "./avatarFileName.js";
import { useMediaUrl } from "./useMedia.js";

/** An avatar looked at full size (of a room, a space or the account): zoom, and save it to the device. */
export function AvatarViewer(props: { visible: boolean; onClose: () => void; title: string; avatar: MxcUri | undefined; preview: string | undefined }) {
  const t = useT();
  const services = useServices();
  // The picture itself, fetched once it is opened to be looked at.
  const original = useMediaUrl(props.visible ? props.avatar : undefined, {});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [saved]);
  const save = services.saveFile
    ? {
        label: t("viewer.save"),
        disabled: !original,
        onPress: () => {
          if (original)
            void services
              .saveFile?.({ url: original, name: avatarFileName(props.title, original) })
              .then((r) => setSaved(r === "saved"))
              .catch(() => {});
        },
      }
    : undefined;
  return (
    <ImageViewer
      visible={props.visible}
      onClose={props.onClose}
      title={props.title}
      uri={original}
      previewUri={props.preview}
      save={save}
      notice={saved ? t("viewer.saved") : undefined}
      labels={{ close: t("viewer.close"), zoomIn: t("viewer.zoomIn"), zoomOut: t("viewer.zoomOut"), fit: t("viewer.fit") }}
    />
  );
}
