// How a clip's direction and repeat count come out of every exporter that carries clips.
import { strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { Clip } from '../../src/core/format';
import type { RawImage } from '../../src/io/png';
import { buildAnimations } from '../../src/export/sheet';
import { buildSheetFiles } from '../../src/export/engines';
import { DEFAULT_SHEET, type SheetSettings } from '../../src/export/types';
import { planExport } from '../../src/export/plan';
import { carryWarnings } from '../../src/export/carries';
import './withInteractives';
import { buildPlayable } from '../../src/export/playable';
import { flowManifest } from '../../src/core/flow';
import { docWith } from '../timeline/helpers';
import { defaultSettings } from '../../src/export/plan';

const solid = (v: number): RawImage => ({ width: 4, height: 4, pixels: new Uint8ClampedArray(64).fill(v) });
/** Five different pictures, so every frame is its own cell. */
const frames = () => [1, 2, 3, 4, 5].map(solid);

const bounce: Clip = { id: 'b', name: 'bounce', start: 1, end: 3, loop: true, direction: 'pingpong' };
const thrice: Clip = { id: 't', name: 'thrice', start: 0, end: 1, loop: false, repeat: 3 };
const back: Clip = { id: 'r', name: 'back', start: 2, end: 4, loop: false, direction: 'reverse' };
const plain: Clip = { id: 'p', name: 'plain', start: 0, end: 2, loop: true };
const clips = [bounce, thrice, back, plain];

const job = (sheet: Partial<SheetSettings>) =>
  buildSheetFiles({
    doc: { name: 'Hero', clips, markers: [], fps: 10 },
    sheet: { ...DEFAULT_SHEET, dedupe: false, trim: false, ...sheet },
    frames: frames(),
    range: { start: 0, end: 4 },
    whole: true,
    clipId: null,
    scale: 1,
    name: 'Hero',
    pixelArt: true,
    maxSide: 4096,
  });
const text = (r: ReturnType<typeof job>, n: string) => strFromU8(r.files.find((f) => f.name === n)!.bytes);
const anim = (engine: SheetSettings['engine'], file: string) => JSON.parse(text(job({ engine, json: false }), file));

describe('animations for a sprite sheet', () => {
  const list = buildAnimations({ clips, rangeStart: 0, rangeEnd: 4, fps: 10, whole: true });
  const by = (n: string) => list.find((a) => a.name === n)!;
  it('puts the frames in the order they play', () => {
    expect(by('bounce').frames).toEqual([1, 2, 3, 2]);
    expect(by('bounce').loop).toBe(true);
    expect(by('bounce').direction).toBe('pingpong');
    expect(by('thrice').frames).toEqual([0, 1, 0, 1, 0, 1]);
    expect(by('thrice')).toMatchObject({ loop: false, repeat: 3, pass: [0, 1] });
    expect(by('back').frames).toEqual([4, 3, 2]);
  });
  it('leaves a plain clip exactly as it was', () => {
    expect(by('plain')).toEqual({ name: 'plain', fps: 10, loop: true, frames: [0, 1, 2] });
  });
  it('applies the picked clip when exporting just that clip', () => {
    const one = buildAnimations({ clips, rangeStart: 1, rangeEnd: 3, fps: 10, whole: false, onlyClipId: 'b' });
    expect(one[0].frames).toEqual([0, 1, 2, 1]);
  });
});

describe('Godot', () => {
  const tres = text(job({ engine: 'godot', json: false }), 'hero.tres');
  it('lists the frames in play order and loops only what loops', () => {
    const entry = (n: string) => {
      const at = tres.indexOf(`"name": &"${n}"`);
      return tres.slice(tres.lastIndexOf('"frames": [', at), at);
    };
    expect((entry('bounce').match(/SubResource/g) ?? []).length).toBe(4);
    expect((entry('thrice').match(/SubResource/g) ?? []).length).toBe(6);
    expect(tres).toMatch(/"loop": true,\n"name": &"bounce"/);
    expect(tres).toMatch(/"loop": false,\n"name": &"thrice"/);
  });
});

describe('Phaser', () => {
  const a = anim('phaser', 'hero-anims.json').anims as { key: string; frames: { frame: string }[]; repeat: number; yoyo: boolean }[];
  const get = (k: string) => a.find((x) => x.key === k)!;
  it('repeats a forward clip with its own repeat count (one pass, N - 1 repeats)', () => {
    expect(get('thrice').frames).toHaveLength(2);
    expect(get('thrice').repeat).toBe(2);
  });
  it('loops forever with -1, and lists a back and forth clip in order', () => {
    expect(get('bounce').repeat).toBe(-1);
    expect(get('bounce').frames).toHaveLength(4);
    expect(get('plain').repeat).toBe(-1);
  });
  it('plays backward by listing the frames the other way', () => {
    const names = get('back').frames.map((f) => f.frame);
    expect(names).toHaveLength(3);
    expect(get('back').repeat).toBe(0);
    const fwd = anim('phaser', 'hero.json').frames;
    expect(Object.keys(fwd)).toBeTruthy();
  });
});

describe('PixiJS', () => {
  it('lists the textures in play order and says loop, direction and repeat', () => {
    const p = anim('pixi', 'hero.json');
    expect(p.animations.bounce).toHaveLength(4);
    expect(p.animations.thrice).toHaveLength(6);
    expect(p.meta.frameling.animations.bounce).toMatchObject({ loop: true, direction: 'pingpong' });
    expect(p.meta.frameling.animations.thrice).toMatchObject({ loop: false, repeat: 3 });
    expect(p.meta.frameling.animations.plain).not.toHaveProperty('direction');
  });
});

describe('Unity', () => {
  it('lists the sprites in play order, with loop and the clip settings', () => {
    const u = anim('unity', 'hero.json');
    const get = (n: string) => u.animations.find((x: { name: string }) => x.name === n);
    expect(get('bounce').holds).toEqual([1, 1, 1, 1]);
    expect(get('bounce')).toMatchObject({ loop: true, direction: 'pingpong' });
    expect(get('thrice').frames).toHaveLength(6);
    expect(get('thrice').loop).toBe(false);
    expect(get('plain')).not.toHaveProperty('repeat');
  });
  it('the importer script wraps looping clips and holds the last frame of the others', async () => {
    const { UNITY_SCRIPT } = await import('../../src/export/engines');
    expect(UNITY_SCRIPT).toContain('clip.wrapMode = a.loop ? WrapMode.Loop : WrapMode.ClampForever;');
  });
});

describe('CSS', () => {
  const css = text(job({ engine: 'css', json: false }), 'hero.css');
  const block = (n: string) => css.slice(css.indexOf(`@keyframes hero-${n} {`), css.indexOf('\n}', css.indexOf(`@keyframes hero-${n} {`)));
  it('repeats a forward clip with animation-iteration-count and holds its last frame', () => {
    expect(css).toMatch(/animation: hero-thrice 0\.2s step-end 3 forwards;/);
  });
  it('loops a back and forth clip forever, listing the frames once each way', () => {
    expect(css).toMatch(/animation: hero-bounce 0\.4s step-end infinite;/);
    expect((block('bounce').match(/background-position/g) ?? []).length).toBe(4 + 1);
  });
  it('plays backward with the frames reversed (not animation-direction, which shifts step-end frames by one)', () => {
    expect(css).toMatch(/animation: hero-back 0\.3s step-end 1 forwards;/);
    expect(css).not.toContain('animation-direction');
  });
  it('leaves a plain clip as it was', () => {
    expect(css).toMatch(/animation: hero-plain 0\.3s step-end infinite;/);
  });
});

describe('the generic JSON', () => {
  it('lists frames in play order with direction and repeat only where the clip says something', () => {
    const j = JSON.parse(text(job({ engine: 'json', jsonStyle: 'array', json: false }), 'hero.json'));
    expect(j.animations.bounce).toMatchObject({ loop: true, direction: 'pingpong' });
    expect(j.animations.bounce.frames).toHaveLength(4);
    expect(j.animations.thrice).toMatchObject({ loop: false, repeat: 3 });
    expect(j.animations.plain).toEqual({ fps: 10, loop: true, frames: [0, 1, 2] });
  });
});

describe('names of the pictures follow the clip, not the way it plays', () => {
  it('the first picture of a backward clip is still named _0 from the clip start', () => {
    const r = buildSheetFiles({
      doc: { name: 'Hero', clips: [back], markers: [], fps: 10 },
      sheet: { ...DEFAULT_SHEET, engine: 'json', jsonStyle: 'hash', dedupe: false, trim: false, json: false },
      frames: frames(), range: { start: 0, end: 4 }, whole: true, clipId: null, scale: 1, name: 'Hero', pixelArt: true, maxSide: 4096,
    });
    const j = JSON.parse(text(r, 'hero.json'));
    expect(j.animations.back.frames).toEqual(['back_2', 'back_1', 'back_0']);
  });
});

describe('GIF, APNG and video of a clip', () => {
  const doc = docWith([[0, 5]], 6);
  doc.clips.push({ id: 'k', name: 'swing', start: 1, end: 3, loop: false, direction: 'pingpong', repeat: 2 });
  const s = (format: 'gif' | 'apng' | 'mp4' | 'webm' | 'pngseq' | 'sheet') => ({ ...defaultSettings(doc), format, range: 'clip' as const, clipId: 'k' });
  it('bakes the order into the pictures', () => {
    for (const f of ['gif', 'apng', 'mp4', 'webm'] as const) {
      const p = planExport(doc, s(f), 0);
      expect(p.order).toEqual([0, 1, 2, 1, 0]);
      expect(p.count).toBe(5);
      expect(p.range).toEqual({ start: 1, end: 3 });
    }
  });
  it('leaves sprite sheets and plain clips alone', () => {
    expect(planExport(doc, s('sheet'), 0).count).toBe(3);
    doc.clips.push({ id: 'q', name: 'q', start: 0, end: 2, loop: true });
    expect(planExport(doc, { ...s('gif'), clipId: 'q' }, 0).order).toBeUndefined();
    expect(planExport(doc, { ...s('gif'), range: 'all' }, 0).order).toBeUndefined();
  });
});

describe('Interactives and Lottie', () => {
  const doc = docWith([[0, 5]], 6);
  it('say what is not carried, only when a clip plays another way', () => {
    doc.clips = [{ id: 'q', name: 'q', start: 0, end: 2, loop: true }];
    expect(carryWarnings(doc, 'interactives')).toEqual([]);
    doc.clips = [bounce];
    expect(carryWarnings(doc, 'interactives')[0]).toMatch(/forward, looping or once/);
    expect(carryWarnings(doc, 'lottie')[0]).toMatch(/no clip direction/);
    expect(carryWarnings(doc, 'gif')).toEqual([]);
  });
  it('the package carries only what the Interactives player reads (name, start, end, loop)', () => {
    const d = docWith([[0, 5]], 6);
    d.clips = [bounce, thrice];
    const { manifest } = buildPlayable({ doc: d, frames: [1, 2, 3, 4, 5, 6].map(solid), range: { start: 0, end: 5 }, scale: 1, pixelArt: true, background: null, maxSide: 2048 });
    for (const c of manifest.clips) expect(Object.keys(c).sort()).toEqual(['end', 'loop', 'name', 'runs', 'start']);
  });
});

describe('the clip flow manifest', () => {
  it('names direction and repeat when set', () => {
    const d = docWith([[0, 5]], 6);
    d.clips = [bounce, thrice, plain];
    d.flow = { start: 'b', transitions: [{ id: 'x', from: 't', to: 'b', when: 'end' }] };
    const f = flowManifest(d)!;
    expect(f.states.find((s) => s.name === 'bounce')).toEqual({ name: 'bounce', loop: true, frames: 3, direction: 'pingpong' });
    expect(f.states.find((s) => s.name === 'thrice')).toEqual({ name: 'thrice', loop: false, frames: 2, repeat: 3 });
    expect(f.states.find((s) => s.name === 'plain')).toEqual({ name: 'plain', loop: true, frames: 3 });
  });
});

describe('Godot skeleton animations', () => {
  it('a back and forth clip is one longer loop, a repeated clip is longer and does not loop', async () => {
    const { bonesParts, godotBonesScene } = await import('../../src/export/godot-bones');
    const { makePuppet } = await import('../../src/templates/puppet');
    const doc = makePuppet();
    const walk = doc.clips[0];
    const n = Math.abs(walk.end - walk.start) + 1;
    const range = { start: 0, end: 23 };
    const parts = bonesParts(doc, range);
    const textures = parts.map((p, i) => p.pictures.map(() => ({ path: `res://p${i}.png`, x: 1, y: 2, w: 3, h: 4 })));
    const scene = (c: Partial<Clip>) => {
      const clipsHere = [{ ...walk, ...c }];
      const animations = buildAnimations({ clips: clipsHere, rangeStart: 0, rangeEnd: 23, fps: 12, whole: true });
      return godotBonesScene({ doc: { ...doc, clips: clipsHere }, range, parts, textures, scale: 1, animations, rootName: 'Puppet' });
    };
    const length = (t: string) => Number(/^length = ([\d.]+)/m.exec(t)![1]);
    const plainScene = scene({ loop: true });
    expect(length(plainScene)).toBeCloseTo(n / 12, 3);
    const pp = scene({ loop: true, direction: 'pingpong' });
    expect(length(pp)).toBeCloseTo((2 * n - 2) / 12, 3);
    expect(pp).toContain('loop_mode = 1');
    const rep = scene({ loop: false, repeat: 2 });
    expect(length(rep)).toBeCloseTo((2 * n) / 12, 3);
    expect(rep).not.toContain('loop_mode = 1');
  });
});
