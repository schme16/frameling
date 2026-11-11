// The sounds themselves, made from a few notes each. Pure maths, no DOM: the app turns the samples into an
// AudioBuffer, and the demo clip script writes them to a WAV. Everything here is original, nothing is sampled.

export type SoundCue = 'step' | 'celebrate' | 'exported' | 'refused' | 'goodbye' | 'nothingToUndo' | 'tick';

interface Note {
  /** Start, in seconds from the start of the cue. */
  at: number;
  hz: number;
  /** Seconds until it has faded away. */
  dur: number;
  /** 0 to 1, before the master volume. */
  gain: number;
  /** A soft click of noise instead of a tone (the page-flip tick). */
  noise?: boolean;
  /** Where the pitch ends up, as a multiple of `hz` (0.9 slides down a little). */
  bend?: number;
}

export interface CueDef {
  /** Plain name, for Preferences and the help. */
  label: string;
  notes: Note[];
  /** The shortest gap between two of these, in ms, so a held key or a burst of errors doesn't turn into a buzz. */
  gap: number;
  /** Just for fun (not telling you anything): left out when the computer asks for less going on. */
  decorative?: boolean;
}

const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880, C6 = 1046.5, E6 = 1318.51, G6 = 1567.98;
const A3 = 220, D4 = 293.66, G4 = 392, A4 = 440;

export const CUES: Record<SoundCue, CueDef> = {
  step: { label: 'Quest step done', gap: 250, notes: [{ at: 0, hz: E5, dur: 0.22, gain: 0.45 }, { at: 0.07, hz: A5, dur: 0.4, gain: 0.4 }] },
  celebrate: {
    label: 'Quest finished',
    gap: 1500,
    notes: [
      { at: 0, hz: C5, dur: 0.4, gain: 0.4 },
      { at: 0.09, hz: E5, dur: 0.4, gain: 0.4 },
      { at: 0.18, hz: G5, dur: 0.45, gain: 0.4 },
      { at: 0.27, hz: C6, dur: 0.9, gain: 0.42 },
      { at: 0.38, hz: E6, dur: 0.6, gain: 0.14 },
      { at: 0.46, hz: G6, dur: 0.6, gain: 0.1 },
    ],
  },
  exported: {
    label: 'Export finished',
    gap: 600,
    notes: [
      { at: 0, hz: G4, dur: 0.3, gain: 0.4 },
      { at: 0.11, hz: D5, dur: 0.75, gain: 0.4 },
      { at: 0.11, hz: G5, dur: 0.75, gain: 0.18 },
    ],
  },
  refused: {
    label: "Can't do that",
    gap: 400,
    notes: [
      { at: 0, hz: D4, dur: 0.16, gain: 0.45, bend: 0.94 },
      { at: 0.1, hz: A3, dur: 0.26, gain: 0.45, bend: 0.94 },
    ],
  },
  goodbye: {
    label: "Quill's goodbye",
    gap: 2000,
    notes: [
      { at: 0, hz: E5, dur: 0.45, gain: 0.35 },
      { at: 0.32, hz: C5, dur: 0.45, gain: 0.35 },
      { at: 0.64, hz: A4, dur: 1.2, gain: 0.38, bend: 0.97 },
    ],
  },
  nothingToUndo: { label: 'Nothing left to undo', gap: 300, notes: [{ at: 0, hz: 330, dur: 0.12, gain: 0.5, bend: 0.7 }] },
  tick: {
    label: 'Frame step',
    gap: 70,
    decorative: true,
    notes: [
      { at: 0, hz: 0, dur: 0.03, gain: 0.2, noise: true },
      { at: 0, hz: 2400, dur: 0.025, gain: 0.04 },
    ],
  },
};

export const ALL_CUES = Object.keys(CUES) as SoundCue[];

/** How long a cue lasts, in seconds. */
export function cueLength(cue: SoundCue): number {
  return Math.max(...CUES[cue].notes.map((n) => n.at + n.dur));
}

/** The cue as mono samples between -1 and 1. Same numbers every time (the noise is seeded). */
export function synthCue(cue: SoundCue, rate = 48000): Float32Array {
  const out = new Float32Array(Math.ceil((cueLength(cue) + 0.02) * rate));
  let seed = 0x2f6b1a3d;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000 - 0.5;
  };
  for (const n of CUES[cue].notes) {
    const start = Math.round(n.at * rate);
    const len = Math.round(n.dur * rate);
    const attack = Math.max(1, Math.round((n.noise ? 0.001 : 0.006) * rate));
    // Down by 60 dB over the note: soft, like a struck bell or a wooden block.
    const k = Math.log(1000) / len;
    let phase = 0;
    let prev = 0;
    for (let i = 0; i < len && start + i < out.length; i++) {
      const env = (i < attack ? i / attack : 1) * Math.exp(-k * i);
      let v: number;
      if (n.noise) {
        // White noise through a crude high-pass: a dry paper click.
        const r = rand();
        v = r - prev;
        prev = r;
      } else {
        const hz = n.bend ? n.hz * (1 + (n.bend - 1) * (i / len)) : n.hz;
        phase += (2 * Math.PI * hz) / rate;
        // A little of the octave above gives it a rounder, bell-like body without getting bright.
        v = Math.sin(phase) + 0.12 * Math.sin(2 * phase) * Math.exp(-k * i * 2);
      }
      out[start + i] += v * env * n.gain;
    }
  }
  // Short fade at the very end so nothing clicks off.
  const tail = Math.min(out.length, Math.round(0.01 * rate));
  for (let i = 0; i < tail; i++) out[out.length - 1 - i] *= i / tail;
  for (let i = 0; i < out.length; i++) out[i] = Math.max(-1, Math.min(1, out[i]));
  return out;
}

/**
 * Says whether a cue may play now: each cue keeps its own gap, and two different cues never land within 60 ms of
 * each other (a refusal toast and an undo bonk at once would just be noise).
 */
export function createLimiter(anyGap = 60): (cue: SoundCue, now: number) => boolean {
  const last = new Map<SoundCue, number>();
  let lastAny = -Infinity;
  return (cue, now) => {
    if (now - (last.get(cue) ?? -Infinity) < CUES[cue].gap) return false;
    if (now - lastAny < anyGap) return false;
    last.set(cue, now);
    lastAny = now;
    return true;
  };
}

/** A 16-bit mono WAV of some samples (for the demo clip). */
export function toWav(samples: Float32Array, rate = 48000): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return new Uint8Array(buf);
}
