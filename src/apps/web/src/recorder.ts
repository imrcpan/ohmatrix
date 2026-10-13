import { RecordError, type Recorder, type RecordedMedia } from "@ohmatrix/core";

const AUDIO_TYPES = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
const VIDEO_TYPES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
const WAVE_POINTS = 64;

/** Down-sample loudness readings to a fixed number of bars, scaled so the loudest one reaches 1. */
export function toWaveform(levels: number[], points = WAVE_POINTS): number[] {
  if (levels.length === 0) return [];
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const from = Math.floor((i / points) * levels.length),
      to = Math.max(from + 1, Math.floor(((i + 1) / points) * levels.length));
    const slice = levels.slice(from, to);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  const peak = Math.max(...out, 0.0001);
  return out.map((v) => Math.round((v / peak) * 100) / 100);
}

/** Opens the microphone (and camera) with the browser's own permission prompt; recording starts with `start()`. */
export async function openRecorder(kind: "audio" | "video"): Promise<Recorder> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new RecordError("unsupported", "MediaRecorder is not available");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(
      kind === "audio" ? { audio: true } : { audio: true, video: { width: { ideal: 640 }, height: { ideal: 480 } } },
    );
  } catch (e) {
    const name = (e as DOMException).name;
    throw new RecordError(name === "NotFoundError" || name === "OverconstrainedError" ? "no_device" : "denied", (e as Error).message);
  }
  const mimeType = (kind === "audio" ? AUDIO_TYPES : VIDEO_TYPES).find((t) => MediaRecorder.isTypeSupported(t));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  // Loudness: an analyser on the audio track, read ten times a second.
  const levels: number[] = [];
  const listeners = new Set<(level: number) => void>();
  let audioCtx: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  if (stream.getAudioTracks().length) {
    audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);
    timer = setInterval(() => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) {
        const x = (v - 128) / 128;
        sum += x * x;
      }
      const level = Math.min(1, Math.sqrt(sum / buf.length) * 3.5);
      if (recorder.state === "recording") levels.push(level);
      listeners.forEach((cb) => cb(level));
    }, 100);
  }

  let startedAt = 0;
  const release = () => {
    clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
    void audioCtx?.close().catch(() => {});
  };

  return {
    kind,
    preview: kind === "video" ? stream : undefined,
    start() {
      startedAt = Date.now();
      recorder.start(250);
    },
    onLevel(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    stop(): Promise<RecordedMedia> {
      return new Promise((resolve, reject) => {
        const finish = () => {
          const durationMs = Math.max(1, Date.now() - startedAt);
          release();
          const type = recorder.mimeType || mimeType || (kind === "audio" ? "audio/webm" : "video/webm");
          const base = type.split(";")[0]!;
          const ext = base.includes("ogg") ? "ogg" : base.includes("mp4") ? "mp4" : "webm";
          const blob = new Blob(chunks, { type: base });
          resolve({
            name: `${kind === "audio" ? "voice" : "video"}-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}.${ext}`,
            mimeType: base,
            size: blob.size,
            data: blob,
            durationMs,
            ...(kind === "audio" ? { voice: true, waveform: toWaveform(levels) } : {}),
          });
        };
        if (recorder.state === "inactive") {
          reject(new Error("not recording"));
          return;
        }
        recorder.onstop = finish;
        recorder.stop();
      });
    },
    cancel() {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
      release();
    },
  };
}
