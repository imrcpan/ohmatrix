import type { EventItemLike } from "./timelineItem.js";

/** Which kind of message a file is, by its type. */
export function kindOfMime(mime: string): "image" | "video" | "audio" | "file" {
  return mime.startsWith("image/") ? "image" : mime.startsWith("video/") ? "video" : mime.startsWith("audio/") ? "audio" : "file";
}

/** A local file as a path (the app hands over `file://` addresses, some percent-encoded). */
export function pathOf(data: unknown): string {
  const raw =
    typeof data === "string"
      ? data
      : data && typeof data === "object" && typeof (data as { uri?: unknown }).uri === "string"
        ? (data as { uri: string }).uri
        : "";
  if (!raw) throw new Error("the file has no path");
  if (!raw.startsWith("file://")) return raw;
  const path = raw.slice("file://".length);
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

const rest = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

/**
 * The content of an `m.room.message` that says what a message says, to send it to another room; `null` for what is not
 * a message that can be passed on (a service line, a message that could not be read).
 */
export function forwardContent(e: EventItemLike): Record<string, unknown> | null {
  const c = e.content;
  // A file in an encrypted room is opened with the keys the message holds; an open one by its address.
  const file = (url: string, encryption: string | undefined) => (encryption ? { file: JSON.parse(encryption) as unknown } : { url });
  switch (c.type) {
    case "text":
      return rest({ msgtype: "m.text", body: c.body, ...(c.formattedBody && { format: "org.matrix.custom.html", formatted_body: c.formattedBody }) });
    case "image":
      return { msgtype: "m.image", body: c.body, ...file(c.url, c.encryption), info: rest({ mimetype: c.mimeType, w: c.width, h: c.height }) };
    case "video":
      return {
        msgtype: "m.video",
        body: c.name,
        ...file(c.url, c.encryption),
        info: rest({ mimetype: c.mimeType, size: c.size, w: c.width, h: c.height, duration: c.durationMs }),
      };
    case "audio":
      return {
        msgtype: "m.audio",
        body: c.name,
        ...file(c.url, c.encryption),
        info: rest({ mimetype: c.mimeType, size: c.size, duration: c.durationMs }),
        ...(c.voice && { "org.matrix.msc3245.voice": {} }),
      };
    case "file":
      return { msgtype: "m.file", body: c.name, ...file(c.url, c.encryption), info: rest({ mimetype: c.mimeType, size: c.size }) };
    default:
      return null;
  }
}
