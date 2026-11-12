import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { decodePng, type RawImage } from '../../src/io/png';
import { loadFile, saveFile } from '../../src/io/file';
import { buildPlayable, playableClips, playablePackage, playableRuns, PLAYABLE_FORMAT, type PlayableManifest } from '../../src/export/playable';
import { defaultSettings, filtersFor, planExport } from '../../src/export/plan';
import { formatInfo } from '../../src/export/types';
import './withInteractives';
import { makeHeroSprite } from '../../src/templates/hero-sprite';
import { newDoc } from '../../src/core/doc';
import { artFrames } from './helpers';

const solid = (w: number, h: number, v: number): RawImage => {
  const p = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) p.set([v, v, v, 255], i * 4);
  return { width: w, height: h, pixels: p };
};

describe('Interactives package', () => {
  it('is an animated format with its own extension', () => {
    const info = formatInfo('interactives');
    expect(info.ext).toBe('flplay');
    expect(info.animated).toBe(true);
    expect(filtersFor('interactives')[0].extensions).toEqual(['flplay']);
    const doc = newDoc({ name: 'Wave', width: 64, height: 32, fps: 12, length: 4 });
    const plan = planExport(doc, { ...defaultSettings(doc), format: 'interactives' }, 0);
    expect(plan.problem).toBeNull();
    expect(plan.count).toBe(4);
  });

  it('moves clips into the range and drops the ones outside it', () => {
    const clips = [
      { id: 'a', name: 'idle', start: 0, end: 3, loop: true },
      { id: 'b', name: 'run', start: 4, end: 9, loop: false },
      { id: 'c', name: 'idle', start: 10, end: 12, loop: true },
      { id: 'd', name: 'far', start: 30, end: 40, loop: true },
    ];
    expect(playableClips({ clips }, { start: 2, end: 11 })).toEqual([
      { name: 'idle', start: 0, end: 1, loop: true },
      { name: 'run', start: 2, end: 7, loop: false },
      { name: 'idle_', start: 8, end: 9, loop: true },
    ]);
  });

  it('merges held frames into runs with their time', () => {
    expect(playableRuns([0, 0, 0, 1, 2, 2], 0, 5, 12)).toEqual([
      { cell: 0, frames: 3, ms: 250 },
      { cell: 1, frames: 1, ms: 83 },
      { cell: 2, frames: 2, ms: 167 },
    ]);
  });

  it('stores a held picture once and starts each clip on its own picture', () => {
    const doc = newDoc({ name: 'Blink', width: 4, height: 4, fps: 10, length: 5 });
    doc.clips = [
      { id: 'a', name: 'open', start: 0, end: 2, loop: true },
      { id: 'b', name: 'still', start: 3, end: 4, loop: false },
    ];
    doc.markers = [{ id: 'm', name: 'blink', frame: 2 }];
    // Frames 0-3 look the same, frame 4 differs. Frame 3 starts a clip, so it gets its own copy.
    const frames = [solid(4, 4, 10), solid(4, 4, 10), solid(4, 4, 10), solid(4, 4, 10), solid(4, 4, 200)];
    const { manifest, atlas } = buildPlayable({ doc, frames, range: { start: 0, end: 4 }, scale: 1, pixelArt: true, background: null, maxSide: 1024 });
    expect(manifest.frames).toEqual([0, 0, 0, 1, 2]);
    expect(manifest.cells).toHaveLength(3);
    expect(manifest.clips[0].runs).toEqual([{ cell: 0, frames: 3, ms: 300 }]);
    expect(manifest.clips[1]).toMatchObject({ name: 'still', start: 3, end: 4, loop: false });
    expect(manifest.markers).toEqual([{ name: 'blink', frame: 2 }]);
    // Every picture is inside the atlas, with room around it
    for (const c of manifest.cells) {
      expect(c.x).toBeGreaterThanOrEqual(1);
      expect(c.x + c.w).toBeLessThanOrEqual(atlas.width);
      expect(c.y + c.h).toBeLessThanOrEqual(atlas.height);
      const at = (c.y * atlas.width + c.x) * 4;
      expect(atlas.pixels[at + 3]).toBe(255);
    }
  });

  it('trims each picture and says where it sat in the frame', () => {
    const doc = newDoc({ name: 'Dot', width: 8, height: 8, fps: 12, length: 1 });
    const f = { width: 8, height: 8, pixels: new Uint8ClampedArray(8 * 8 * 4) };
    f.pixels.set([255, 0, 0, 255], (5 * 8 + 6) * 4);
    const { manifest } = buildPlayable({ doc, frames: [f], range: { start: 0, end: 0 }, scale: 1, pixelArt: false, background: null, maxSide: 64 });
    expect(manifest.cells[0]).toMatchObject({ w: 1, h: 1, ox: 6, oy: 5 });
  });

  it('packs the hero sprite into one zip that opens again', () => {
    const doc = makeHeroSprite();
    const frames = artFrames(doc);
    const source = saveFile(doc, 'test');
    const { bytes, manifest } = playablePackage({ doc, frames, range: { start: 0, end: doc.length - 1 }, scale: 1 / 8, pixelArt: true, background: null, maxSide: 4096, appVersion: 'test', source });
    const files = unzipSync(bytes);
    expect(Object.keys(files).sort()).toEqual(['atlas.png', 'manifest.json', 'source.frameling']);
    const m = JSON.parse(strFromU8(files['manifest.json'])) as PlayableManifest;
    expect(m).toEqual(manifest);
    expect(m.format).toBe(PLAYABLE_FORMAT);
    expect(m.pixelArt).toBe(true);
    expect(m.clips.map((c) => c.name)).toEqual(doc.clips.map((c) => c.name));
    expect(m.frames).toHaveLength(doc.length);
    // Held frames make fewer pictures than frames
    expect(m.cells.length).toBeLessThan(doc.length);
    const atlas = decodePng(files['atlas.png']);
    expect([atlas.width, atlas.height]).toEqual([m.atlas.width, m.atlas.height]);
    expect(loadFile(files['source.frameling']).doc.name).toBe(doc.name);
  });

  it('leaves the editable drawing out when asked', () => {
    const doc = makeHeroSprite();
    const { bytes, manifest } = playablePackage({ doc, frames: artFrames(doc), range: { start: 0, end: doc.length - 1 }, scale: 1 / 8, pixelArt: true, background: null, maxSide: 4096 });
    expect(manifest.source).toBeNull();
    expect(Object.keys(unzipSync(bytes))).not.toContain('source.frameling');
  });

  it('says so when the pictures cannot fit', () => {
    const doc = newDoc({ name: 'Big', width: 40, height: 40, fps: 12, length: 4 });
    const frames = [10, 20, 30, 40].map((v) => solid(40, 40, v));
    expect(() => buildPlayable({ doc, frames, range: { start: 0, end: 3 }, scale: 1, pixelArt: false, background: null, maxSide: 50 })).toThrow(/would not fit/);
  });
});
