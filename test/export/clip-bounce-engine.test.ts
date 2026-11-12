// "Back-and-forth clips in game engines": baked by default, the engine's own ping-pong when asked (Godot and Phaser only).
import { strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import type { Clip } from '../../src/core/format';
import type { RawImage } from '../../src/io/png';
import { buildAnimations } from '../../src/export/sheet';
import { buildSheetFiles } from '../../src/export/engines';
import { DEFAULT_SHEET, type SheetSettings } from '../../src/export/types';
import { currentChoice, getChoiceDef } from '../../src/core/choices';
import '../../src/export/choices';

const solid = (v: number): RawImage => ({ width: 4, height: 4, pixels: new Uint8ClampedArray(64).fill(v) });
const frames = () => [1, 2, 3, 4, 5].map(solid);

const loopPP: Clip = { id: 'a', name: 'swing', start: 0, end: 3, loop: true, direction: 'pingpong' };
const loopPPR: Clip = { id: 'b', name: 'swingback', start: 0, end: 3, loop: true, direction: 'pingpong-reverse' };
const twoWays: Clip = { id: 'c', name: 'twoways', start: 0, end: 3, loop: false, direction: 'pingpong', repeat: 2 };
const threeWays: Clip = { id: 'd', name: 'threeways', start: 0, end: 3, loop: false, direction: 'pingpong', repeat: 3 };
const oneWay: Clip = { id: 'e', name: 'oneway', start: 0, end: 3, loop: false, direction: 'pingpong' };
const fwd: Clip = { id: 'f', name: 'plain', start: 0, end: 3, loop: true };
const clips = [loopPP, loopPPR, twoWays, threeWays, oneWay, fwd];

const run = (engine: SheetSettings['engine'], nativeBounce?: boolean) =>
  buildSheetFiles({
    doc: { name: 'Hero', clips, markers: [], fps: 10 },
    sheet: { ...DEFAULT_SHEET, engine, dedupe: false, trim: false, json: false },
    frames: frames(),
    range: { start: 0, end: 4 },
    whole: true,
    clipId: null,
    scale: 1,
    name: 'Hero',
    pixelArt: true,
    maxSide: 4096,
    ...(nativeBounce === undefined ? {} : { nativeBounce }),
  });
const text = (r: ReturnType<typeof run>, n: string) => strFromU8(r.files.find((f) => f.name === n)!.bytes);
const phaser = (nativeBounce?: boolean) => {
  const j = JSON.parse(text(run('phaser', nativeBounce), 'hero-anims.json'));
  return Object.fromEntries(j.anims.map((a: any) => [a.key, a])) as Record<string, { frames: { frame: string }[]; repeat: number; yoyo: boolean }>;
};

describe('the preference', () => {
  it('is Baked by default and has the engine choice', () => {
    const def = getChoiceDef('export.clipEngineBounce')!;
    expect(def.title).toBe('Back-and-forth clips in game engines');
    expect(def.category).toBe('Export');
    expect(def.options.map((o) => [o.value, o.label])).toEqual([
      ['bake', 'Baked, ends show once'],
      ['engine', "Engine's own ping-pong"],
    ]);
    expect(currentChoice('export.clipEngineBounce')).toBe('bake');
  });
});

describe('animations know what an engine could bounce', () => {
  const list = buildAnimations({ clips, rangeStart: 0, rangeEnd: 4, fps: 10, whole: true });
  const by = (n: string) => list.find((a) => a.name === n)!;
  it('offers one direction for a loop and for an even count, and nothing for the rest', () => {
    expect(by('swing').bounce).toEqual({ leg: [0, 1, 2, 3], trips: Infinity });
    expect(by('swingback').bounce).toEqual({ leg: [3, 2, 1, 0], trips: Infinity });
    expect(by('twoways').bounce).toEqual({ leg: [0, 1, 2, 3], trips: 1 });
    expect(by('threeways').bounce).toBeUndefined();
    expect(by('oneway').bounce).toBeUndefined();
    expect(by('plain').bounce).toBeUndefined();
  });
  it('still lists the baked order, the ends once', () => {
    expect(by('swing').frames).toEqual([0, 1, 2, 3, 2, 1]);
    expect(by('twoways').frames).toEqual([0, 1, 2, 3, 2, 1, 0]);
    expect(by('threeways').frames).toEqual([0, 1, 2, 3, 2, 1, 0, 1, 2, 3]);
    expect(by('oneway').frames).toEqual([0, 1, 2, 3]);
  });
});

describe('Phaser', () => {
  it('lists every frame by default', () => {
    for (const a of [phaser(), phaser(false)]) {
      expect(a.swing.frames).toHaveLength(6);
      expect(a.swing).toMatchObject({ repeat: -1, yoyo: false });
      expect(a.twoways).toMatchObject({ repeat: 0, yoyo: false });
      expect(a.twoways.frames).toHaveLength(7);
    }
  });
  it('uses yoyo when asked: a loop, and an even count as round trips', () => {
    const a = phaser(true);
    expect(a.swing).toMatchObject({ repeat: -1, yoyo: true });
    expect(a.swing.frames).toHaveLength(4);
    expect(a.swingback.frames.map((f) => f.frame)[0]).toMatch(/_3$/);
    expect(a.twoways).toMatchObject({ repeat: 0, yoyo: true });
    expect(a.twoways.frames).toHaveLength(4);
  });
  it('keeps listing what yoyo cannot say (an odd count, once) and leaves other clips alone', () => {
    const a = phaser(true);
    expect(a.threeways).toMatchObject({ repeat: 0, yoyo: false });
    expect(a.threeways.frames).toHaveLength(10);
    expect(a.oneway).toMatchObject({ repeat: 0, yoyo: false });
    expect(a.oneway.frames).toHaveLength(4);
    expect(a.plain).toMatchObject({ repeat: -1, yoyo: false });
  });
});

describe('Godot sprite frames', () => {
  const frameCount = (t: string, name: string) => {
    const at = t.indexOf(`"name": &"${name}"`);
    const start = t.lastIndexOf('{\n"frames": [', at);
    return (t.slice(start, at).match(/"duration"/g) ?? []).length;
  };
  const loopOf = (t: string, name: string) => {
    const at = t.indexOf(`"name": &"${name}"`);
    const start = t.lastIndexOf('{\n"frames": [', at);
    return /"loop": (\w+)/.exec(t.slice(start, at))![1];
  };
  it('lists every frame and a plain loop by default', () => {
    const t = text(run('godot'), 'hero.tres');
    expect(frameCount(t, 'swing')).toBe(6);
    expect(loopOf(t, 'swing')).toBe('true');
  });
  it('uses loop mode 2 (ping-pong) for a looping clip when asked, listing one direction', () => {
    const t = text(run('godot', true), 'hero.tres');
    expect(frameCount(t, 'swing')).toBe(4);
    expect(loopOf(t, 'swing')).toBe('2');
    expect(frameCount(t, 'swingback')).toBe(4);
    expect(loopOf(t, 'swingback')).toBe('2');
  });
  it('keeps baking what a sprite frames loop mode cannot say', () => {
    const t = text(run('godot', true), 'hero.tres');
    expect(frameCount(t, 'twoways')).toBe(7);
    expect(loopOf(t, 'twoways')).toBe('false');
    expect(frameCount(t, 'threeways')).toBe(10);
    expect(loopOf(t, 'plain')).toBe('true');
  });
});

describe('other formats always bake', () => {
  it('the JSON, Pixi and CSS lists do not change with the preference', () => {
    for (const engine of ['json', 'pixi', 'css', 'unity'] as const) {
      const a = run(engine, false);
      const b = run(engine, true);
      expect(b.files.map((f) => [f.name, strFromU8(f.bytes)])).toEqual(a.files.map((f) => [f.name, strFromU8(f.bytes)]));
    }
  });
});

describe('Godot skeleton animations', () => {
  it('uses the AnimationPlayer ping-pong loop (2) for a looping back and forth clip when asked', async () => {
    const { bonesParts, godotBonesScene } = await import('../../src/export/godot-bones');
    const { makePuppet } = await import('../../src/templates/puppet');
    const doc = makePuppet();
    const walk = doc.clips[0];
    const n = Math.abs(walk.end - walk.start) + 1;
    const range = { start: 0, end: 23 };
    const parts = bonesParts(doc, range);
    const textures = parts.map((p, i) => p.pictures.map(() => ({ path: `res://p${i}.png`, x: 1, y: 2, w: 3, h: 4 })));
    const scene = (c: Partial<Clip>, nativeBounce?: boolean) => {
      const clipsHere = [{ ...walk, ...c }];
      const animations = buildAnimations({ clips: clipsHere, rangeStart: 0, rangeEnd: 23, fps: 12, whole: true });
      return godotBonesScene({ doc: { ...doc, clips: clipsHere }, range, parts, textures, scale: 1, animations, rootName: 'Puppet', nativeBounce });
    };
    const length = (t: string) => Number(/^length = ([\d.]+)/m.exec(t)![1]);
    const baked = scene({ loop: true, direction: 'pingpong' });
    expect(baked).toContain('loop_mode = 1');
    expect(length(baked)).toBeCloseTo((2 * n - 2) / 12, 3);
    const native = scene({ loop: true, direction: 'pingpong' }, true);
    expect(native).toContain('loop_mode = 2');
    expect(length(native)).toBeCloseTo(n / 12, 3);
    // A clip that plays a set number of directions has no ping-pong loop to use, so it stays baked.
    const finite = scene({ loop: false, direction: 'pingpong', repeat: 2 }, true);
    expect(finite).not.toContain('loop_mode = 2');
    expect(length(finite)).toBeCloseTo((2 * n - 1) / 12, 3);
  });
});
