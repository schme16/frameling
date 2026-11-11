// Plays the little sounds, only when Sounds is on in Preferences. Each cue is made once (synth.ts), kept as an
// AudioBuffer, and rate-limited so held keys and bursts of messages stay calm. Silent wherever there's no audio.
import { getPrefs, reducedMotion } from '../prefs';
import { createLimiter, CUES, synthCue, type SoundCue } from './synth';

export type { SoundCue } from './synth';

let ctx: AudioContext | null = null;
const buffers = new Map<SoundCue, AudioBuffer>();
let allow = createLimiter();

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function bufferFor(a: AudioContext, cue: SoundCue): AudioBuffer {
  let b = buffers.get(cue);
  if (!b) {
    const samples = synthCue(cue, a.sampleRate);
    b = a.createBuffer(1, samples.length, a.sampleRate);
    b.getChannelData(0).set(samples);
    buffers.set(cue, b);
  }
  return b;
}

/** True when this cue would make a sound right now (Sounds on, not too soon, not muted by the calm setting). */
export function cueWanted(cue: SoundCue, now = Date.now()): boolean {
  const p = getPrefs();
  if (!p.sounds || p.soundVolume <= 0) return false;
  if (CUES[cue].decorative && reducedMotion()) return false;
  return allow(cue, now);
}

/** Plays a cue if Sounds is on. Safe to call from anywhere, any time. */
export function playCue(cue: SoundCue): void {
  if (!cueWanted(cue)) return;
  play(cue, getPrefs().soundVolume);
}

/** Plays a cue whatever the switch says (the Try button in Preferences). */
export function previewCue(cue: SoundCue, volume = getPrefs().soundVolume): void {
  play(cue, volume);
}

function play(cue: SoundCue, volume: number): void {
  const a = audio();
  if (!a) return;
  try {
    const src = a.createBufferSource();
    src.buffer = bufferFor(a, cue);
    const g = a.createGain();
    // Kept well under full scale: these sit underneath whatever else is going on.
    g.gain.value = Math.max(0, Math.min(1, volume)) * 0.5;
    src.connect(g).connect(a.destination);
    src.start();
  } catch {
    // No audio here. Fine.
  }
}

/** For tests. */
export function resetSounds(): void {
  allow = createLimiter();
}
