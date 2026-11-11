/** Waveform peaks: one small number per slice of time, worked out once per sound and reused for every zoom level. */

/** Slices per second. Fine enough for the biggest zoom, small enough that a minute is 24 thousand numbers. */
export const PEAKS_PER_SECOND = 400;

/** Loudest sample in each slice (all channels together), 0 to 255 for 0 to full scale. */
export function computePeaks(channels: ArrayLike<number>[], sampleRate: number, perSecond = PEAKS_PER_SECOND): Uint8Array {
  const n = channels.reduce((m, c) => Math.max(m, c.length), 0);
  const per = Math.max(1, sampleRate / perSecond);
  const count = Math.ceil(n / per);
  const out = new Uint8Array(count);
  for (const ch of channels) {
    for (let i = 0; i < count; i++) {
      const a = Math.floor(i * per);
      const b = Math.min(ch.length, Math.floor((i + 1) * per));
      let m = 0;
      for (let k = a; k < b; k++) {
        const v = ch[k] < 0 ? -ch[k] : ch[k];
        if (v > m) m = v;
      }
      const q = Math.min(255, Math.round(m * 255));
      if (q > out[i]) out[i] = q;
    }
  }
  return out;
}

/**
 * Boils the peaks down to one value per screen column for the part from `t0` seconds on, `secPerPx` seconds per
 * column. Each column takes the loudest slice it covers. Returns values from 0 to 1.
 */
export function columnPeaks(peaks: Uint8Array, t0: number, secPerPx: number, width: number, perSecond = PEAKS_PER_SECOND): Float32Array {
  const out = new Float32Array(Math.max(0, width));
  for (let x = 0; x < out.length; x++) {
    const a = Math.max(0, Math.floor((t0 + x * secPerPx) * perSecond));
    const b = Math.max(a + 1, Math.ceil((t0 + (x + 1) * secPerPx) * perSecond));
    let m = 0;
    for (let i = a; i < b && i < peaks.length; i++) if (peaks[i] > m) m = peaks[i];
    out[x] = m / 255;
  }
  return out;
}

/** How much to boost the drawing so a quiet recording still shows (never shrinks, never more than 4 times). */
export function displayGain(peaks: Uint8Array): number {
  let m = 0;
  for (let i = 0; i < peaks.length; i++) if (peaks[i] > m) m = peaks[i];
  return m === 0 ? 1 : Math.min(4, Math.max(1, 230 / m));
}

const cache = new WeakMap<object, Uint8Array>();

/** Peaks for a decoded sound, worked out the first time. */
export function peaksFor(buffer: { numberOfChannels: number; sampleRate: number; getChannelData(i: number): Float32Array }): Uint8Array {
  let p = cache.get(buffer);
  if (!p) {
    const ch: Float32Array[] = [];
    for (let i = 0; i < buffer.numberOfChannels; i++) ch.push(buffer.getChannelData(i));
    p = computePeaks(ch, buffer.sampleRate);
    cache.set(buffer, p);
  }
  return p;
}
