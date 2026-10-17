/** The name a saved picture gets: the owner's name, and the picture's own extension when the address has one (otherwise the platform finds it out). */
export function avatarFileName(title: string, url: string | undefined): string {
  const base = title.replace(/[\\/:*?"<>|]+/g, "_").trim() || "avatar";
  const ext = /\.(png|jpe?g|gif|webp)(?:$|\?)/i.exec(url ?? "")?.[1]?.toLowerCase();
  return ext ? `${base}.${ext}` : base;
}
