/** Auto lip sync: listen to a sound, guess a mouth for each frame, write them onto the mouth layer. */
import type { Doc, Id } from '../core/format';
import { store } from '../core/store';
import { decodeClip } from '../audio/decode';
import { guessMouthsAsync, toMono } from './analysis';
import { applyMouths, isMouthLayer } from './apply';

export type LipSyncResult = { ok: true; keys: number; first: number; frames: number } | { ok: false; why: string };

/** The frames a sound covers inside the animation: where they start and how many there are (0 when none fit). */
export function soundFrames(clip: { start: number; duration?: number }, fps: number, docLength: number): { first: number; frames: number } {
  const total = Math.max(1, Math.ceil((clip.duration ?? 0) * fps - 1e-9));
  const first = Math.max(0, clip.start);
  const end = Math.min(docLength, clip.start + total);
  return { first, frames: Math.max(0, end - first) };
}

/** The mono samples for the frames a sound covers inside the animation. */
export function samplesFor(channels: Float32Array[], sampleRate: number, clip: { start: number }, fps: number): Float32Array {
  const mono = toMono(channels);
  const skip = clip.start < 0 ? Math.round((-clip.start / fps) * sampleRate) : 0;
  return skip ? mono.subarray(Math.min(mono.length, skip)) : mono;
}

/** `text` is what is said, if the person typed it: it helps line the mouths up with the words. */
export async function lipSync(clipId: Id, layerId: Id, text = ''): Promise<LipSyncResult> {
  const doc: Doc = store().get().doc;
  const clip = doc.audio?.find((c) => c.id === clipId);
  const layer = doc.layers.find((l) => l.id === layerId);
  if (!clip) return { ok: false, why: 'That sound is not in the animation any more.' };
  if (!layer || !isMouthLayer(doc, layer)) return { ok: false, why: 'That layer has no mouth on it.' };
  const buf = await decodeClip(clip);
  if (!buf) return { ok: false, why: "This computer couldn't read that sound, so there was nothing to listen to." };
  const { first, frames } = soundFrames({ start: clip.start, duration: buf.duration }, doc.fps, doc.length);
  if (!frames) return { ok: false, why: 'The sound sits outside the animation. Drag it onto the frames, or make the animation longer.' };
  const channels = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  // The pronunciation list is only fetched when words were typed.
  const said = text.trim();
  const expected = said ? await (await import('./dict')).expectedFromText(said) : undefined;
  const mouths = await guessMouthsAsync(samplesFor(channels, buf.sampleRate, clip, doc.fps), buf.sampleRate, doc.fps, frames, { text: said, expected });
  let keys = 0;
  store().update(`Lip sync "${clip.name}"`, (d) => {
    keys = applyMouths(d, layerId, first, mouths);
  });
  return keys ? { ok: true, keys, first, frames } : { ok: false, why: 'Nothing could be written to that layer.' };
}
