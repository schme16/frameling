// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { AudioClip } from '../../src/core/format';
import { resetStore } from '../../src/core/store';
import { audibleClips, clipEnd, clipFrames, clipGain, clipOffset, mimeFor, soundName } from '../../src/audio/clips';
import { planVoices } from '../../src/audio/engine';
import { frameSlice, audioCodecOrder, needsMov, noSoundNote, uncompressedSoundNote } from '../../src/audio/export';
import { planMix } from '../../src/audio/mix';
import { moveClip, pickedClip, removeClip, renameClip, setMuted, setVolume } from '../../src/audio/ops';
import { pickSound } from '../../src/audio/state';
import { columnPeaks, computePeaks, displayGain } from '../../src/audio/peaks';

const c = (id: string, extra: Partial<AudioClip> = {}): AudioClip => ({ id, name: id, start: 0, data: new Uint8Array([id.charCodeAt(0)]), mime: 'audio/wav', duration: 2, ...extra });

describe('clip maths', () => {
  it('counts frames, rounding up, at least one', () => {
    expect(clipFrames({ duration: 2 }, 24)).toBe(48);
    expect(clipFrames({ duration: 2.01 }, 24)).toBe(49);
    expect(clipFrames({}, 24)).toBe(1);
    expect(clipEnd({ start: 10, duration: 1 }, 12)).toBe(22);
    expect(clipOffset({ start: 12 }, 36, 24)).toBe(1);
    expect(clipOffset({ start: 12 }, 0, 24)).toBe(-0.5);
  });
  it('treats mute as no volume and keeps volume in range', () => {
    expect(clipGain({})).toBe(1);
    expect(clipGain({ volume: 0.3 })).toBe(0.3);
    expect(clipGain({ volume: 3 })).toBe(1);
    expect(clipGain({ volume: 0.5, muted: true })).toBe(0);
    expect(audibleClips([c('a'), c('b', { muted: true }), c('c', { volume: 0 })]).map((x) => x.id)).toEqual(['a']);
  });
  it('names files', () => {
    expect(soundName('my.voice.take2.mp3')).toBe('my.voice.take2');
    expect(mimeFor('x.MP3', '')).toBe('audio/mpeg');
    expect(mimeFor('x.wav', 'audio/x-wav')).toBe('audio/x-wav');
  });
});

describe('what plays from a frame', () => {
  const dur = () => 2;
  it('starts at the right place inside a sound that has begun', () => {
    const [p] = planVoices([c('a', { start: 10 })], 24, 34, dur);
    expect(p.delay).toBe(0);
    expect(p.offset).toBeCloseTo(1, 6);
  });
  it('waits for a sound that has not begun yet', () => {
    const [p] = planVoices([c('a', { start: 30 })], 24, 6, dur);
    expect(p.offset).toBe(0);
    expect(p.delay).toBeCloseTo(1, 6);
  });
  it('skips sounds that are over, muted or unknown length', () => {
    expect(planVoices([c('a', { start: 0 })], 24, 48, dur)).toEqual([]);
    expect(planVoices([c('a', { muted: true })], 24, 0, dur)).toEqual([]);
    expect(planVoices([c('a')], 24, 0, () => 0)).toEqual([]);
    expect(planVoices(undefined, 24, 0, dur)).toEqual([]);
  });
  it('handles a sound that starts before frame 0', () => {
    const [p] = planVoices([c('a', { start: -12 })], 24, 0, dur);
    expect(p.offset).toBeCloseTo(0.5, 6);
  });
});

describe('mixing for export', () => {
  it('places each sound inside the exported range', () => {
    const dur = () => 2;
    // Export frames 24 to 71 (2 seconds at 24 fps).
    const parts = planMix([c('a', { start: 36 }), c('b', { start: 12 }), c('m', { muted: true, start: 30 }), c('z', { start: 200 })], 24, 24, 48, dur);
    expect(parts.map((p) => p.clip.id)).toEqual(['a', 'b']);
    expect(parts[0]).toMatchObject({ when: 0.5, offset: 0 });
    expect(parts[0].length).toBeCloseTo(1.5, 6);
    expect(parts[1].when).toBe(0);
    expect(parts[1].offset).toBeCloseTo(0.5, 6);
    expect(parts[1].length).toBeCloseTo(1.5, 6);
  });
  it('applies volume', () => {
    expect(planMix([c('a', { volume: 0.25 })], 24, 0, 24, () => 1)[0].gain).toBe(0.25);
  });
  it('slices the mix a frame at a time with nothing lost', () => {
    const rate = 48000;
    const total = 48000 * 2;
    let covered = 0;
    let last = 0;
    for (let i = 0; i < 48; i++) {
      const [a, b] = frameSlice(i, 48, 24, rate, total);
      expect(a).toBe(last);
      covered += b - a;
      last = b;
    }
    expect(covered).toBe(total);
    expect(frameSlice(47, 48, 24, rate, total + 100)[1]).toBe(total + 100);
  });
  it('prefers AAC then Opus for MP4, with plain sound last so older Safari (no audio encoder) still keeps it; Opus for WebM', () => {
    expect(audioCodecOrder(true)).toEqual(['aac', 'opus', 'pcm-s16']);
    expect(audioCodecOrder(false)[0]).toBe('opus');
    // A WebM never gets plain sound: browsers do not play it there.
    expect(audioCodecOrder(false).some((x) => x.startsWith('pcm'))).toBe(false);
  });
  it('writes sound carried as it is into a MOV, and compressed sound into the MP4 or WebM', () => {
    expect(needsMov('pcm-s16')).toBe(true);
    for (const c of ['aac', 'opus', 'vorbis', undefined] as const) expect(needsMov(c)).toBe(false);
  });
  it('says what happened to the sound in plain words, without dashes', () => {
    expect(noSoundNote(true)).toMatch(/no sound/);
    expect(noSoundNote(false)).toMatch(/WebM.*MP4 keeps its sound/);
    expect(uncompressedSoundNote()).toMatch(/MOV file.*sound as it is.*bigger/);
    for (const t of [noSoundNote(true), noSoundNote(false), uncompressedSoundNote()]) expect(t).not.toMatch(/[\u2013\u2014]/);
  });
});

describe('waveform peaks', () => {
  it('takes the loudest sample of each slice', () => {
    const ch = new Float32Array(400);
    ch[10] = 0.5;
    ch[150] = -1;
    const p = computePeaks([ch], 400, 4);
    expect(p).toHaveLength(4);
    expect([...p]).toEqual([128, 255, 0, 0]);
  });
  it('merges channels and reduces to columns', () => {
    const a = new Float32Array(1000);
    const b = new Float32Array(1000);
    a[0] = 0.2;
    b[999] = 0.8;
    const p = computePeaks([a, b], 1000, 100);
    expect(p[0]).toBe(51);
    expect(p[99]).toBe(204);
    const cols = columnPeaks(p, 0, 0.1, 10, 100);
    expect(cols).toHaveLength(10);
    expect(cols[0]).toBeCloseTo(0.2, 1);
    expect(cols[9]).toBeCloseTo(0.8, 1);
    expect(columnPeaks(p, 5, 0.1, 3, 100)).toEqual(new Float32Array(3));
  });
  it('boosts quiet sounds for drawing, never past four times', () => {
    expect(displayGain(new Uint8Array([255, 10]))).toBe(1);
    expect(displayGain(new Uint8Array([115]))).toBe(2);
    expect(displayGain(new Uint8Array([2]))).toBe(4);
    expect(displayGain(new Uint8Array([0]))).toBe(1);
  });
});

describe('sound actions', () => {
  beforeEach(() => {
    const doc = newDoc({ length: 24 });
    doc.audio = [c('a'), c('b', { start: 5 })];
    resetStore(doc);
    pickSound(null);
  });
  const get = async () => (await import('../../src/core/store')).store().get().doc.audio!;

  it('moves, with drags merging into one undo step', async () => {
    moveClip('b', 6);
    moveClip('b', 9);
    expect((await get())[1].start).toBe(9);
    (await import('../../src/core/store')).store().undo();
    expect((await get())[1].start).toBe(5);
  });
  it('sets volume (full volume leaves no field), mute and name', async () => {
    setVolume('a', 0.4);
    expect((await get())[0].volume).toBe(0.4);
    setVolume('a', 1);
    expect('volume' in (await get())[0]).toBe(false);
    setMuted('a', true);
    expect((await get())[0].muted).toBe(true);
    setMuted('a', false);
    expect('muted' in (await get())[0]).toBe(false);
    renameClip('a', '  Hello  ');
    expect((await get())[0].name).toBe('Hello');
    renameClip('a', '   ');
    expect((await get())[0].name).toBe('Hello');
  });
  it('removes, and drops the list when it is empty', async () => {
    removeClip('a');
    expect((await get()).map((x) => x.id)).toEqual(['b']);
    removeClip('b');
    expect((await import('../../src/core/store')).store().get().doc.audio).toBeUndefined();
  });
  it('works on the picked sound, else the first', () => {
    expect(pickedClip()?.id).toBe('a');
    pickSound('b');
    expect(pickedClip()?.id).toBe('b');
    pickSound('gone');
    expect(pickedClip()?.id).toBe('a');
  });
});
