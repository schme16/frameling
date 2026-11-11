/**
 * Mixing sounds for export: where each one lands in a render of a range of frames. The plan is plain numbers (so it can
 * be tested); `renderMix` runs it through an offline Web Audio context.
 */
import type { AudioClip, Doc } from '../core/format';
import { clipGain } from './clips';
import { decodeClip } from './decode';

export interface MixPart {
  clip: AudioClip;
  /** Seconds into the render when it starts. */
  when: number;
  /** Seconds into the sound to start from (when the range starts partway through it). */
  offset: number;
  /** Seconds of it to play. */
  length: number;
  gain: number;
}

/** What to play, for the frames `start` to `start + count - 1`. Muted sounds and sounds outside the range are left out. */
export function planMix(clips: readonly AudioClip[] | undefined, fps: number, start: number, count: number, durations: (c: AudioClip) => number): MixPart[] {
  const total = count / fps;
  const out: MixPart[] = [];
  for (const clip of clips ?? []) {
    const gain = clipGain(clip);
    const dur = durations(clip);
    if (gain <= 0 || !(dur > 0)) continue;
    const at = (clip.start - start) / fps;
    const when = Math.max(0, at);
    const offset = Math.max(0, -at);
    const length = Math.min(dur - offset, total - when);
    if (length <= 0.0005) continue;
    out.push({ clip, when, offset, length, gain });
  }
  return out;
}

export const MIX_RATE = 48000;

/** Mixes every unmuted sound for the range into one stereo buffer, or null when there is nothing to hear. */
export async function renderMix(doc: Doc, start: number, count: number): Promise<AudioBuffer | null> {
  if (typeof OfflineAudioContext === 'undefined') return null;
  const buffers = new Map<AudioClip, AudioBuffer>();
  for (const c of doc.audio ?? []) {
    const b = await decodeClip(c);
    if (b) buffers.set(c, b);
  }
  const parts = planMix(doc.audio, doc.fps, start, count, (c) => buffers.get(c)?.duration ?? 0);
  if (!parts.length) return null;
  const frames = Math.max(1, Math.ceil((count / doc.fps) * MIX_RATE));
  const ctx = new OfflineAudioContext(2, frames, MIX_RATE);
  for (const p of parts) {
    const src = ctx.createBufferSource();
    src.buffer = buffers.get(p.clip)!;
    const g = ctx.createGain();
    g.gain.value = p.gain;
    src.connect(g).connect(ctx.destination);
    src.start(p.when, p.offset, p.length);
  }
  const mixed = await ctx.startRendering();
  // Sounds stacked on each other can add up past full scale, which crackles: turn the lot down just enough.
  const peak = peakOf(mixed);
  if (peak > 1) {
    for (let c = 0; c < mixed.numberOfChannels; c++) {
      const d = mixed.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] /= peak;
    }
  }
  return mixed;
}

/** The peak of a buffer, so a mix that clips can be turned down a little instead of crackling. */
export function peakOf(buffer: AudioBuffer): number {
  let m = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const v = d[i] < 0 ? -d[i] : d[i];
      if (v > m) m = v;
    }
  }
  return m;
}
