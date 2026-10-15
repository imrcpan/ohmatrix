import type { AttachmentSource } from "@ohmatrix/core";

/** The part of a document picker's file we read. */
export interface PickedDocument {
  uri: string;
  name: string;
  size?: number | undefined;
  mimeType?: string | undefined;
}

const nameOfUri = (uri: string, fallback: string) => decodeURIComponent(uri.split("/").pop()?.split("?")[0] ?? "") || fallback;

/** Files chosen from the system's document picker. */
export function fromDocuments(docs: PickedDocument[]): AttachmentSource[] {
  return docs.map((d) => ({
    name: d.name || nameOfUri(d.uri, "file"),
    mimeType: d.mimeType || "application/octet-stream",
    size: d.size ?? 0,
    data: d.uri,
  }));
}

/** Levels measured while recording (decibels, 0 at the loudest and about -60 at silence) as 0..1. */
export const levelOfDb = (db: number | undefined): number => (db === undefined || !Number.isFinite(db) ? 0 : Math.min(1, Math.max(0, (db + 60) / 60)));

/** At most `max` samples that still show the shape of the recording: each is the loudest of its stretch. */
export function waveformOf(levels: number[], max = 64): number[] {
  if (levels.length <= max) return levels.map((l) => Math.round(l * 100) / 100);
  const out: number[] = [];
  for (let i = 0; i < max; i++) {
    const from = Math.floor((i * levels.length) / max);
    const to = Math.max(from + 1, Math.floor(((i + 1) * levels.length) / max));
    out.push(Math.round(Math.max(...levels.slice(from, to)) * 100) / 100);
  }
  return out;
}
