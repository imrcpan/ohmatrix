import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import type { AttachmentSource } from "@ohmatrix/core";

const types: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  pdf: "application/pdf",
  txt: "text/plain",
};

/** The system's own file chooser; a file is read whole, as the browser's chooser gives it as a `File`. */
export async function pickFiles(): Promise<AttachmentSource[]> {
  const paths = await open({ multiple: true });
  if (!paths) return [];
  return Promise.all(
    paths.map(async (path) => {
      const name = path.split(/[\\/]/).pop() ?? path;
      const mimeType = types[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
      const bytes = await readFile(path);
      return { name, mimeType, size: bytes.length, data: new File([bytes], name, { type: mimeType }) };
    }),
  );
}
