/**
 * Sound while the animation plays or you scrub.
 *
 * It listens to the store instead of being wired into playback: when `ui.playing` turns on it starts every unmuted
 * sound from the playhead, when it turns off it stops them, and when the playhead lands somewhere the sound clock
 * does not expect (a loop wrapping round, a jump, the picture running slow) it starts them again from the new frame.
 * Moving the playhead while paused plays a short snippet (the "Hear the sound while you drag" preference).
 */
import { currentChoice } from '../core/choices';
import type { AudioClip, Doc, Id } from '../core/format';
import { store, type Store } from '../core/store';
import './choices';
import { audibleClips, clipGain, clipOffset } from './clips';
import { decodeClip, readyBuffer } from './decode';

export interface VoicePlan {
  clip: AudioClip;
  /** Seconds from now until it starts (the sound begins later in the animation than the playhead). */
  delay: number;
  /** Seconds into the sound to start from. */
  offset: number;
}

/** Which sounds to start for a playhead on `frame`, and where in each. Sounds already over are left out. */
export function planVoices(clips: readonly AudioClip[] | undefined, fps: number, frame: number, durationOf: (c: AudioClip) => number): VoicePlan[] {
  const out: VoicePlan[] = [];
  for (const clip of audibleClips(clips)) {
    const pos = clipOffset(clip, frame, fps);
    const dur = durationOf(clip);
    if (!(dur > 0) || pos >= dur) continue;
    out.push({ clip, delay: Math.max(0, -pos), offset: Math.max(0, pos) });
  }
  return out;
}

interface Voice {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

let ctx: AudioContext | null = null;
let voices: Voice[] = [];
let snippet: Voice[] = [];
/** While playing: the frame the sound clock started on, and the context time it started at. */
let clock: { frame: number; at: number } | null = null;

function context(): AudioContext | null {
  if (!ctx) {
    if (typeof AudioContext === 'undefined') return null;
    try {
      ctx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

function fadeStop(list: Voice[]): void {
  const c = ctx;
  for (const v of list) {
    try {
      if (c) {
        v.gain.gain.cancelScheduledValues(c.currentTime);
        v.gain.gain.setValueAtTime(v.gain.gain.value, c.currentTime);
        v.gain.gain.linearRampToValueAtTime(0, c.currentTime + 0.012);
        v.src.stop(c.currentTime + 0.015);
      } else v.src.stop();
    } catch {
      // Already finished.
    }
  }
}

function stopAll(): void {
  fadeStop(voices);
  voices = [];
  clock = null;
}

function startVoices(doc: Doc, frame: number, snippetLength: number | null): Voice[] {
  const c = context();
  if (!c) return [];
  const made: Voice[] = [];
  for (const p of planVoices(doc.audio, doc.fps, frame, (cl) => readyBuffer(cl)?.duration ?? 0)) {
    const buf = readyBuffer(p.clip);
    if (!buf) continue;
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    const g = clipGain(p.clip);
    const t = c.currentTime + p.delay;
    if (snippetLength === null) {
      gain.gain.value = g;
      src.connect(gain).connect(c.destination);
      src.start(t, p.offset);
    } else {
      // A short snippet fades in and out so scrubbing ticks and clicks less.
      const len = Math.min(snippetLength, buf.duration - p.offset);
      if (len <= 0) continue;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(g, t + 0.006);
      gain.gain.setValueAtTime(g, t + Math.max(0.006, len - 0.012));
      gain.gain.linearRampToValueAtTime(0, t + len);
      src.connect(gain).connect(c.destination);
      src.start(t, p.offset, len);
    }
    const v: Voice = { src, gain };
    src.onended = () => {
      voices = voices.filter((x) => x !== v);
      snippet = snippet.filter((x) => x !== v);
    };
    made.push(v);
  }
  return made;
}

/** Starts decoding every sound in the document, so playing never waits on it. */
function warm(doc: Doc): void {
  for (const c of doc.audio ?? []) void decodeClip(c);
}

const hasSound = (doc: Doc) => !!doc.audio?.length && !doc.editing?.length;

/** Hooks the sound to a store. Returns a function that unhooks it. */
export function installAudio(s: Store = store()): () => void {
  let lastDoc = s.get().doc;
  let lastFrame = s.get().ui.frame;
  let wasPlaying = false;
  warm(lastDoc);
  const off = s.subscribe(() => {
    const { doc, ui } = s.get();
    const docMoved = doc !== lastDoc;
    if (docMoved && doc.audio !== lastDoc.audio) warm(doc);
    const frameMoved = ui.frame !== lastFrame;
    const playingChanged = ui.playing !== wasPlaying;
    lastDoc = doc;
    lastFrame = ui.frame;
    wasPlaying = ui.playing;

    if (!hasSound(doc)) {
      if (voices.length || clock) stopAll();
      return;
    }
    if (ui.playing) {
      const c = context();
      if (!c) return;
      if (playingChanged || !clock) {
        stopAll();
        fadeStop(snippet);
        snippet = [];
        voices = startVoices(doc, ui.frame, null);
        clock = { frame: ui.frame, at: c.currentTime };
      } else {
        // The sound has its own clock: if the picture is somewhere else, say after a loop, follow the picture.
        const expected = clock.frame + (c.currentTime - clock.at) * doc.fps;
        if (Math.abs(ui.frame + 0.5 - expected) > Math.max(3, doc.fps * 0.12)) {
          stopAll();
          voices = startVoices(doc, ui.frame, null);
          clock = { frame: ui.frame, at: c.currentTime };
        }
      }
      return;
    }
    if (playingChanged) {
      stopAll();
      return;
    }
    // Paused: moving the playhead plays a snippet (not when the whole document changed under it, like opening a file).
    if (frameMoved && !docMoved && currentChoice('audio.scrub') === 'on') {
      fadeStop(snippet);
      snippet = startVoices(doc, ui.frame, Math.max(0.1, 1.5 / doc.fps));
    }
  });
  return () => {
    off();
    stopAll();
  };
}

/** Which sound is playing right now (for tests and the shot script). */
export function voiceCount(): number {
  return voices.length + snippet.length;
}

export type { Id };
