export interface Probe {
  durationMs?: number;
  width?: number;
  height?: number;
  /** A still from the video, as JPEG, for a poster. */
  poster?: { blob: Blob; width: number; height: number };
}

const POSTER_MAX = 320;

/**
 * Reads what the browser knows about an audio or video file (length, picture size) and, for video, grabs a poster frame.
 * Best effort: gives up after a few seconds and returns what it has; returns {} outside a browser.
 */
export async function probeMedia(blob: Blob, kind: "audio" | "video"): Promise<Probe> {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc || typeof URL.createObjectURL !== "function") return {};
  const url = URL.createObjectURL(blob);
  const el = doc.createElement(kind);
  el.preload = "metadata";
  el.muted = true;
  (el as HTMLVideoElement).playsInline = true;
  const done = (v: Probe) => {
    URL.revokeObjectURL(url);
    el.removeAttribute("src");
    el.load();
    return v;
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("probe timed out")), 4000);
      el.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve();
      };
      el.onerror = () => {
        clearTimeout(timer);
        reject(new Error("probe failed"));
      };
      el.src = url;
    });
    // MediaRecorder output has no length in its header (Infinity): seeking far forces the browser to find the end.
    if (!Number.isFinite(el.duration)) {
      await new Promise<void>((resolve) => {
        el.ontimeupdate = () => {
          el.ontimeupdate = null;
          resolve();
        };
        el.currentTime = 1e9;
        setTimeout(resolve, 1500);
      });
    }
    const out: Probe = {};
    if (Number.isFinite(el.duration) && el.duration > 0) out.durationMs = Math.round(el.duration * 1000);
    if (kind === "video") {
      const v = el as HTMLVideoElement;
      if (v.videoWidth) {
        out.width = v.videoWidth;
        out.height = v.videoHeight;
      }
      if (v.videoWidth && v.videoHeight) {
        await new Promise<void>((resolve) => {
          v.onseeked = () => resolve();
          v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
          setTimeout(resolve, 1500);
        });
        const k = Math.min(1, POSTER_MAX / Math.max(v.videoWidth, v.videoHeight));
        const canvas = doc.createElement("canvas");
        canvas.width = Math.max(1, Math.round(v.videoWidth * k));
        canvas.height = Math.max(1, Math.round(v.videoHeight * k));
        canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
        const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
        if (jpeg) out.poster = { blob: jpeg, width: canvas.width, height: canvas.height };
      }
    }
    return done(out);
  } catch {
    return done({});
  }
}
