import type { MxcUri } from "@ohmatrix/core";
import { avatarFileName } from "./avatarFileName.js";
import { PhotoViewer } from "./PhotoViewer.js";
import { useMediaUrl } from "./useMedia.js";

/** An avatar looked at full size (of a room, a space or the account). */
export function AvatarViewer(props: { visible: boolean; onClose: () => void; title: string; avatar: MxcUri | undefined; preview: string | undefined }) {
  // The picture itself, fetched once it is opened to be looked at.
  const original = useMediaUrl(props.visible ? props.avatar : undefined, {});
  return (
    <PhotoViewer
      visible={props.visible}
      onClose={props.onClose}
      title={props.title}
      fileName={avatarFileName(props.title, original ?? "")}
      uri={original}
      previewUri={props.preview}
    />
  );
}
