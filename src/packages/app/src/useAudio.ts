import { useCallback, useEffect, useRef, useState } from "react";
import { useServices } from "./context.js";

/** The small part of the browser's audio element we use (shared code is compiled without the DOM library). */
interface AudioLike {
  src?: string;
  currentTime: number;
  readonly duration: number;
  readonly paused: boolean;
  preload?: string;
  play(): Promise<void>;
  pause(): void;
  addEventListener(type: string, cb: () => void): void;
  removeEventListener(type: string, cb: () => void): void;
  release?(): void;
}

/** Only one thing plays at a time: starting a clip pauses whichever was playing. */
let active: { pause: () => void } | null = null;

export interface AudioState {
  status: "idle" | "loading" | "playing" | "paused" | "error";
  /** 0..1 */
  progress: number;
  positionMs: number;
  /** From the file once known, otherwise the length the message announced. */
  durationMs: number | undefined;
}

/**
 * Plays one clip. The file is fetched (and decrypted) only when the user presses play, then handed to an audio element.
 * `load` returns a playable URL; `announcedMs` is the length the message states, shown until the real one is known.
 */
export function useAudioPlayer(load: () => Promise<string>, announcedMs?: number) {
  const services = useServices();
  const el = useRef<AudioLike | null>(null);
  const [state, setState] = useState<AudioState>({ status: "idle", progress: 0, positionMs: 0, durationMs: announcedMs });
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
      el.current?.pause();
      el.current?.release?.();
      if (active && active === handle.current) active = null;
    },
    [],
  );
  const handle = useRef<{ pause: () => void }>({ pause: () => el.current?.pause() });

  const sync = useCallback(() => {
    const a = el.current;
    if (!a || !mounted.current) return;
    const known = Number.isFinite(a.duration) && a.duration > 0 ? a.duration * 1000 : announcedMs;
    setState({
      status: a.paused ? (a.currentTime > 0 && known && a.currentTime * 1000 < known - 50 ? "paused" : "idle") : "playing",
      positionMs: a.currentTime * 1000,
      durationMs: known,
      progress: known ? Math.min(1, (a.currentTime * 1000) / known) : 0,
    });
  }, [announcedMs]);

  const ensure = useCallback(async (): Promise<AudioLike | null> => {
    if (el.current) return el.current;
    const Ctor = (globalThis as { Audio?: new () => AudioLike }).Audio;
    if (!Ctor && !services.createAudio) return null;
    setState((s) => ({ ...s, status: "loading" }));
    try {
      const url = await load();
      let a: AudioLike;
      if (services.createAudio) a = services.createAudio(url);
      else {
        a = new Ctor!();
        a.preload = "auto";
        a.src = url;
      }
      for (const ev of ["timeupdate", "play", "pause", "ended", "loadedmetadata", "durationchange"]) a.addEventListener(ev, sync);
      a.addEventListener("ended", () => {
        a.currentTime = 0;
        sync();
      });
      el.current = a;
      return a;
    } catch {
      if (mounted.current) setState((s) => ({ ...s, status: "error" }));
      return null;
    }
  }, [load, sync, services]);

  const toggle = useCallback(async () => {
    const a = await ensure();
    if (!a) return;
    if (!a.paused) {
      a.pause();
      return;
    }
    if (active && active !== handle.current) active.pause();
    active = handle.current;
    try {
      await a.play();
    } catch {
      setState((s) => ({ ...s, status: "error" }));
    }
    sync();
  }, [ensure, sync]);

  return { state, toggle };
}

/** "0:07", "12:03", "1:02:03". */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return "";
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600),
    m = Math.floor((total % 3600) / 60),
    s = total % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
