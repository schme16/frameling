/**
 * Sound actions, each one undo step: bring a sound in, move it, change its volume, mute it, take it out. They read the
 * store and say what went wrong in plain words.
 */
import { choose } from '../core/choices';
import type { AudioClip, Id } from '../core/format';
import { uid } from '../core/doc';
import { store } from '../core/store';
import { notify } from '../io/notify';
import { pickUpload } from '../platform';
import { ensureLength, MAX_LENGTH } from '../timeline/edit-core';
import type { LongSoundChoice } from './choices';
import { clipEnd, mimeFor, SOUND_ACCEPT, soundName } from './clips';
import { audioSupported, decodeClip } from './decode';
import { soundProblem } from './problem';
import { soundUi } from './state';

export function findClip(id: Id): AudioClip | undefined {
  return store().get().doc.audio?.find((c) => c.id === id);
}

/** Adds a sound from bytes. Resolves with the new clip, or null when the bytes are not a sound this computer can play. */
export async function addSound(bytes: Uint8Array, name: string, mime: string, start = 0): Promise<AudioClip | null> {
  if (!audioSupported()) {
    notify("This computer can't play sound in Frameling, so the sound could not be added.", 'warn');
    return null;
  }
  const clip: AudioClip = { id: uid('au'), name: soundName(name), start, data: bytes, mime };
  const buffer = await decodeClip(clip);
  if (!buffer || !buffer.duration) {
    notify(soundProblem(bytes), 'warn');
    return null;
  }
  clip.duration = buffer.duration;
  const st = store().get();
  const fps = st.doc.fps;
  const end = clipEnd(clip, fps);
  let extend = false;
  if (end > st.doc.length && end <= MAX_LENGTH) extend = (await choose<LongSoundChoice>('audio.longSound')) === 'extend';
  store().update(`Add sound "${clip.name}"`, (d) => {
    (d.audio ??= []).push(clip);
    if (extend) ensureLength(d, end);
  });
  return clip;
}

/** Asks for a sound file and adds it. */
export async function importSound(): Promise<AudioClip | null> {
  const file = await pickUpload(SOUND_ACCEPT);
  if (!file) return null;
  const clip = await addSound(new Uint8Array(await file.arrayBuffer()), file.name, mimeFor(file.name, file.type));
  if (clip) notify(`Added "${clip.name}" to the timeline. Drag it to line it up.`, 'success');
  return clip;
}

function edit(label: string, id: Id, fn: (c: AudioClip) => void, coalesce?: string): void {
  store().update(label, (d) => {
    const c = d.audio?.find((x) => x.id === id);
    if (c) fn(c);
  }, coalesce ? { coalesce } : {});
}

export const moveClip = (id: Id, start: number): void => edit('Move sound', id, (c) => void (c.start = Math.round(start)), `audio-move-${id}`);

export function setVolume(id: Id, volume: number): void {
  const v = Math.min(1, Math.max(0, volume));
  edit('Sound volume', id, (c) => {
    if (v >= 1) delete c.volume;
    else c.volume = v;
  }, `audio-volume-${id}`);
}

export function setMuted(id: Id, muted: boolean): void {
  edit(muted ? 'Mute sound' : 'Unmute sound', id, (c) => {
    if (muted) c.muted = true;
    else delete c.muted;
  });
}

export const renameClip = (id: Id, name: string): void => edit('Rename sound', id, (c) => void (c.name = name.trim() || c.name));

export function removeClip(id: Id): void {
  store().update('Remove sound', (d) => {
    if (!d.audio) return;
    d.audio = d.audio.filter((c) => c.id !== id);
    if (!d.audio.length) delete d.audio;
  });
}

/** The sound to work on when there are several: the one picked in the timeline, else the first. */
export function pickedClip(): AudioClip | undefined {
  const audio = store().get().doc.audio;
  const id = soundUi.get().picked;
  return audio?.find((c) => c.id === id) ?? audio?.[0];
}
