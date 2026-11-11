/**
 * Turns a clip's bytes into something playable (a Web Audio `AudioBuffer`), once. The result is kept per byte array,
 * and edits never copy the bytes, so a clip that moves or changes volume is never decoded again.
 */
import type { AudioClip } from '../core/format';

let decoder: BaseAudioContext | null = null;

/** Decoding happens on an offline context, so it works before anyone has pressed anything (browsers hold back live audio until then). */
function context(): BaseAudioContext | null {
  if (decoder) return decoder;
  if (typeof OfflineAudioContext === 'undefined') return null;
  decoder = new OfflineAudioContext(2, 1, 48000);
  return decoder;
}

export const audioSupported = (): boolean => typeof OfflineAudioContext !== 'undefined';

const pending = new WeakMap<Uint8Array, Promise<AudioBuffer | null>>();
const ready = new WeakMap<Uint8Array, AudioBuffer>();
const listeners = new Set<() => void>();

/** Called whenever a sound finishes decoding (so the timeline can draw its waveform). */
export function onDecoded(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** The decoded sound, or null when the bytes are not a sound this computer can read. */
export function decodeClip(clip: Pick<AudioClip, 'data'>): Promise<AudioBuffer | null> {
  const hit = pending.get(clip.data);
  if (hit) return hit;
  const ctx = context();
  // decodeAudioData takes the buffer it is given, so it gets a copy.
  const p = ctx
    ? ctx
        .decodeAudioData(clip.data.slice().buffer as ArrayBuffer)
        .then((b) => {
          ready.set(clip.data, b);
          for (const fn of listeners) fn();
          return b;
        })
        .catch(() => null)
    : Promise.resolve(null);
  pending.set(clip.data, p);
  return p;
}

/** The decoded sound if it is ready now (null otherwise: ask `decodeClip` to start it). */
export function readyBuffer(clip: Pick<AudioClip, 'data'>): AudioBuffer | null {
  return ready.get(clip.data) ?? null;
}
