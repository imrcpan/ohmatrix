import { useEffect, useState } from "react";
import { Platform, useWindowDimensions } from "react-native";
import { ImageViewer, type ViewRect } from "@ohmatrix/ui";
import { useServices, useT } from "./context.js";

/**
 * Every picture looked at full size goes through this one: zoom, a save button first in the toolbar, and the notice at
 * the top once the picture is in the gallery. `uri` is the sharp version, which may arrive after the viewer opens.
 */
export function PhotoViewer(props: {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** The name a saved copy gets. */
  fileName: string;
  uri: string | undefined;
  previewUri?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  /** Where the picture was on the screen: it grows from there on opening, and shrinks back on leaving. */
  origin?: ViewRect | undefined;
}) {
  const t = useT();
  // The desktop way: the desktop client, or the web in any landscape window (wider than it is tall). A phone, or the web held upright, is the other way.
  const win = useWindowDimensions();
  const desktop = Platform.OS === "web" && (!!(globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ || win.width > win.height);
  const services = useServices();
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [saved]);
  const uri = props.uri;
  const save = services.saveFile
    ? {
        label: t("viewer.save"),
        disabled: !uri,
        onPress: () => {
          if (uri)
            void services
              .saveFile?.({ url: uri, name: props.fileName })
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
      uri={uri}
      previewUri={props.previewUri}
      width={props.width}
      height={props.height}
      origin={props.origin}
      desktop={desktop}
      save={save}
      notice={saved ? t("viewer.saved") : undefined}
      labels={{ close: t("viewer.close"), zoomIn: t("viewer.zoomIn"), zoomOut: t("viewer.zoomOut"), fit: t("viewer.fit") }}
    />
  );
}
