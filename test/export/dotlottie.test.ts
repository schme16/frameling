import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import { docToLottie } from '../../src/export/lottie';
import { dotLottieBytes, dotLottieId, readDotLottie, splitPictures } from '../../src/export/dotlottie';
import { defaultSettings, extensionFor, filtersFor } from '../../src/export/plan';
import { TEMPLATES } from '../../src/templates';

const make = (id: string) => TEMPLATES.find((t) => t.id === id)!.make();

describe('dotLottie export', () => {
  it('names the animation after the document, safe for a file name', () => {
    expect(dotLottieId('Bouncing ball')).toBe('bouncing-ball');
    expect(dotLottieId('  ../Hé llo!! ')).toBe('h-llo');
    expect(dotLottieId('')).toBe('animation');
  });

  it('is a zip with a manifest, the animation and the pictures as files (layout 2, the default)', () => {
    const data = docToLottie(make('hero-sprites'));
    const bytes = dotLottieBytes(data, { generator: 'Frameling test', loop: false });
    const names = Object.keys(unzipSync(bytes));
    expect(names[0]).toBe('manifest.json');
    expect(names.some((n) => n.startsWith('a/') && n.endsWith('.json'))).toBe(true);
    expect(names.some((n) => n.startsWith('i/'))).toBe(true);
    expect(names.some((n) => n.startsWith('animations/') || n.startsWith('images/'))).toBe(false);
    const file = readDotLottie(bytes, unzipSync);
    expect(file.manifest).toEqual({ version: '2', generator: 'Frameling test', initial: { animation: 'game-hero-sprite-set', stateMachine: 'once' }, animations: [{ id: 'game-hero-sprite-set' }], stateMachines: [{ id: 'once' }] });
    const anim = file.animations['game-hero-sprite-set'];
    const pics = anim.assets.filter((a: { p?: string }) => a.p !== undefined);
    expect(pics.length).toBeGreaterThan(0);
    for (const a of pics) {
      expect(a.u).toBe('/i/');
      expect([...file.images[a.p].slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
    expect(JSON.stringify(anim)).not.toContain('data:image');
  });

  it('can be written in the older layout 1: animations/, images/ and loop in the manifest', () => {
    const data = docToLottie(make('hero-sprites'));
    expect(data.assets.some((a: { p?: string }) => a.p?.startsWith('data:image/png;base64,'))).toBe(true);
    const file = readDotLottie(dotLottieBytes(data, { generator: 'Frameling test', loop: false, version: 1 }), unzipSync);
    expect(file.manifest.version).toBe('1.0');
    expect(file.manifest.generator).toBe('Frameling test');
    expect(file.manifest.animations).toEqual([{ id: 'game-hero-sprite-set', autoplay: true, loop: false, speed: 1, direction: 1, playMode: 'normal' }]);
    const anim = file.animations['game-hero-sprite-set'];
    expect(anim.layers.length).toBe(data.layers.length);
    // Every picture the animation names is a real PNG in images/, and no picture is left inside the animation.
    const pics = anim.assets.filter((a: { p?: string }) => a.p !== undefined);
    expect(pics.length).toBeGreaterThan(0);
    for (const a of pics) {
      expect(a.u).toBe('/images/');
      expect(a.e).toBe(0);
      const bytes = file.images[a.p];
      expect(bytes).toBeDefined();
      expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    }
    expect(JSON.stringify(anim)).not.toContain('data:image');
  });

  it('layout 2 keeps the loop setting in a small state machine that plays at once, and says what the setting is', () => {
    const data = docToLottie(make('bouncing-ball'));
    for (const loop of [true, false]) {
      const file = readDotLottie(dotLottieBytes(data, { loop }), unzipSync);
      const id = loop ? 'loop' : 'once';
      expect(file.manifest.stateMachines).toEqual([{ id }]);
      expect(file.manifest.initial.stateMachine).toBe(id);
      const anim = Object.keys(file.animations)[0];
      expect(file.manifest.initial.animation).toBe(anim);
      const [state] = file.machines[id].states;
      expect(file.machines[id].initial).toBe(state.name);
      expect(state).toMatchObject({ type: 'PlaybackState', animation: anim, loop, autoplay: true });
      expect(state.transitions).toEqual([]);
    }
    // Loops unless told otherwise, as layout 1 does.
    expect(readDotLottie(dotLottieBytes(data), unzipSync).manifest.stateMachines).toEqual([{ id: 'loop' }]);
  });

  it('layout 1 keeps the loop in the manifest and has no state machine', () => {
    const data = docToLottie(make('bouncing-ball'));
    for (const loop of [true, false]) {
      const file = readDotLottie(dotLottieBytes(data, { loop, version: 1 }), unzipSync);
      expect(file.manifest.animations[0]).toMatchObject({ autoplay: true, loop });
      expect(file.manifest.stateMachines).toBeUndefined();
      expect(file.machines).toEqual({});
    }
  });

  it('keeps the first entry the manifest and stores a picture that repeats once', () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const data = { nm: 'Two', assets: [{ id: 'a', w: 1, h: 1, p: png, u: '', e: 1 }, { id: 'b', w: 1, h: 1, p: png, u: '', e: 1 }, { id: 'c', layers: [] }], layers: [] };
    const { animation, images } = splitPictures(data, 1);
    expect([...images.keys()]).toEqual(['image_0.png']);
    expect(animation.assets[0].p).toBe('image_0.png');
    expect(animation.assets[1].p).toBe('image_0.png');
    expect(animation.assets[2]).toEqual({ id: 'c', layers: [] });
    expect(Object.keys(unzipSync(dotLottieBytes(data, { version: 1 }))).sort()).toEqual(['animations/two.json', 'images/image_0.png', 'manifest.json']);
    const names = Object.keys(unzipSync(dotLottieBytes(data)));
    expect(names[0]).toBe('manifest.json');
    expect(names.sort()).toEqual(['a/two.json', 'i/image_0.png', 'manifest.json', 's/loop.json']);
  });

  it('is much smaller than the plain file when the animation has many keys', () => {
    const data = docToLottie(make('walk-cycle'));
    expect(dotLottieBytes(data).length).toBeLessThan(JSON.stringify(data).length / 3);
  });

  it('is saved with its own extension and file type', () => {
    expect(extensionFor({ format: 'lottie' })).toBe('json');
    expect(extensionFor({ format: 'lottie', lottieFile: 'dotlottie' })).toBe('lottie');
    expect(extensionFor({ format: 'gif', lottieFile: 'dotlottie' })).toBe('gif');
    expect(filtersFor('lottie', 'dotlottie')).toEqual([{ name: 'dotLottie animation', extensions: ['lottie'] }]);
    expect(filtersFor('lottie')[0].extensions).toEqual(['json']);
    expect(defaultSettings(make('blank-vector')).lottieFile).toBeUndefined();
  });
});
