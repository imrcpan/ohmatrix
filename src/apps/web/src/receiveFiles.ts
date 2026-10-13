import type { AttachmentSource } from "@ohmatrix/core";

export const toSource = (f: File): AttachmentSource => ({ name: f.name, mimeType: f.type || "application/octet-stream", size: f.size, data: f });

const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");

/** Files dragged onto the window or pasted from the clipboard (screenshots, copied files). */
export function receiveFiles(onFiles: (files: AttachmentSource[]) => void, onHover: (over: boolean) => void): () => void {
  let depth = 0;
  const enter = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (depth++ === 0) onHover(true);
  };
  const over = (e: DragEvent) => {
    if (hasFiles(e)) e.preventDefault();
  };
  const leave = (e: DragEvent) => {
    if (hasFiles(e) && --depth <= 0) {
      depth = 0;
      onHover(false);
    }
  };
  const drop = (e: DragEvent) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    onHover(false);
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length) onFiles(files.map(toSource));
  };
  const paste = (e: ClipboardEvent) => {
    const files = [...(e.clipboardData?.files ?? [])];
    if (!files.length) return; // plain text pastes into the composer as usual
    e.preventDefault();
    onFiles(files.map(toSource));
  };
  document.addEventListener("dragenter", enter);
  document.addEventListener("dragover", over);
  document.addEventListener("dragleave", leave);
  document.addEventListener("drop", drop);
  document.addEventListener("paste", paste);
  return () => {
    document.removeEventListener("dragenter", enter);
    document.removeEventListener("dragover", over);
    document.removeEventListener("dragleave", leave);
    document.removeEventListener("drop", drop);
    document.removeEventListener("paste", paste);
    onHover(false);
  };
}
