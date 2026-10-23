import type { CallSounds } from "@ohmatrix/core";

/**
 * Ring and tones made with the browser's own audio (no sound files): an incoming call rings two rising notes twice a second and
 * a half, an outgoing one beeps the long "ringing" tone, and the end of a call is a short falling pair. Starting needs the page to have
 * been touched once (the browser's rule), which a call to place or answer always has; an incoming ring before any touch is silent.
 */
export function createWebCallSounds(): CallSounds {
  let ctx: AudioContext | null = null;
  const audio = () => {
    const C = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext;
    if (!C) return null;
    ctx ??= new C();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  };
  const tone = (c: AudioContext, freq: number, start: number, length: number, volume: number) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.02);
    gain.gain.setValueAtTime(volume, start + length - 0.05);
    gain.gain.linearRampToValueAtTime(0, start + length);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + length + 0.02);
  };
  return {
    play(kind) {
      const c = audio();
      if (!c) return () => {};
      const ring = () => {
        const t0 = c.currentTime + 0.02;
        if (kind === "incoming") {
          tone(c, 659, t0, 0.18, 0.18);
          tone(c, 880, t0 + 0.2, 0.28, 0.18);
          tone(c, 659, t0 + 0.7, 0.18, 0.18);
          tone(c, 880, t0 + 0.9, 0.28, 0.18);
        } else {
          tone(c, 440, t0, 1.2, 0.1);
        }
      };
      ring();
      const timer = setInterval(ring, kind === "incoming" ? 2500 : 3500);
      return () => clearInterval(timer);
    },
    ended() {
      const c = audio();
      if (!c) return;
      const t0 = c.currentTime + 0.02;
      tone(c, 523, t0, 0.14, 0.16);
      tone(c, 392, t0 + 0.16, 0.22, 0.16);
    },
  };
}
