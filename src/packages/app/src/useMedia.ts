import { useEffect, useState } from "react";
import type { MxcUri } from "@ohmatrix/core";
import type { AppController } from "@ohmatrix/state";
import { useController } from "./context.js";

/** Loads an mxc image through the engine; returns undefined until ready or on failure (callers fall back). */
export function useMediaUrl(
  mxc: MxcUri | undefined,
  size: { width?: number; height?: number; fit?: "crop" | "scale"; encryption?: unknown; mimeType?: string },
  /** Resolve through another account's controller than the one on screen (the account list shows them all). */
  from?: AppController,
): string | undefined {
  const shown = useController();
  const controller = from ?? shown;
  const [url, setUrl] = useState<string>();
  const { width, height, fit, encryption, mimeType } = size;
  useEffect(() => {
    setUrl(undefined);
    if (!mxc) return;
    let live = true;
    controller
      .resolveMedia(mxc, {
        ...(width && { width }),
        ...(height && { height }),
        ...(fit && { fit }),
        ...(encryption ? { encryption } : {}),
        ...(mimeType && { mimeType }),
      })
      .then(
        (u) => {
          if (live) setUrl(u);
        },
        () => {},
      );
    return () => {
      live = false;
    };
  }, [controller, mxc, width, height, fit, encryption, mimeType]);
  return url;
}
