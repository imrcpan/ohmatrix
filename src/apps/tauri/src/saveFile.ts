import { downloadDir, join } from "@tauri-apps/api/path";
import { exists, writeFile } from "@tauri-apps/plugin-fs";
import { chosenFolder } from "./downloadFolder.js";
import { isPermissionGranted, sendNotification } from "@tauri-apps/plugin-notification";

const extensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };

/** `name`, or `name (2)`, `name (3)`... when the folder has that name already: a file saved earlier is never written over. */
async function freeName(folder: string, name: string) {
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? name : `${stem} (${n})${ext}`;
    const path = await join(folder, candidate);
    if (!(await exists(path))) return { path, candidate };
  }
}

/** Saves into the folder the person chose in Settings, or the system's Downloads folder, and says so in a notification when those are allowed. */
export async function saveFile({ url, name }: { url: string; name: string }): Promise<void> {
  const blob = await (await fetch(url)).blob();
  let filename = name.replace(/[\\/]/g, "_");
  // A name with no extension (an avatar has none): the file's own type says what to add.
  const extension = extensions[blob.type];
  if (!/\.[A-Za-z0-9]{2,5}$/.test(filename) && extension) filename = `${filename}.${extension}`;
  const folder = chosenFolder() ?? (await downloadDir());
  const { path, candidate } = await freeName(folder, filename);
  await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
  if (await isPermissionGranted()) sendNotification({ title: candidate, body: `Saved to ${folder.split(/[\\/]/).filter(Boolean).pop() ?? folder}` });
}
