// @vitest-environment jsdom
// Sensible starting lengths: a one-picture pixel file is 1 frame, an animation 4, and the Preview stays away until
// a one-picture file gets a second frame or board.
import { describe, expect, it } from 'vitest';
import { addArtboard } from '../../src/artboards/model';
import { newDoc } from '../../src/core/doc';
import type { Doc } from '../../src/core/format';
import { makeBlankLevel, makeBlankPixel } from '../../src/templates/blank';
import { docFromCustom, docFromPreset, PRESETS } from '../../src/ui/presets';
import { START_FRAMES } from '../../src/pixel/units';
import { isOnePicture, watchOnePicture, type PreviewDock } from '../../src/pixel/workspace';

const preset = (id: string) => docFromPreset(PRESETS.find((p) => p.id === id)!);

describe('starting lengths', () => {
  it('a one-picture file starts at 1 frame, an animation at 4', () => {
    expect(START_FRAMES).toEqual({ picture: 1, animation: 4 });
  });
  it('the sprite cards on the New sheet are one picture', () => {
    expect(preset('tiny-sprite').length).toBe(1);
    expect(preset('game-sprite').length).toBe(1);
    expect(docFromCustom({ name: 'x', width: 16, height: 16, fps: 12, pixel: true, pixelSize: 8 }).length).toBe(1);
  });
  it('the blank pixel starter is an animation of 4, the blank level one picture', () => {
    expect(makeBlankPixel().length).toBe(4);
    const level = makeBlankLevel();
    expect(level.length).toBe(1);
    expect(level.layers[0].cels.every((c) => c.start + c.length <= level.length)).toBe(true);
  });
  it('vector pages and their usual length are left alone', () => {
    expect(preset('doodle').length).toBe(24);
    expect(docFromCustom({ name: 'x', width: 100, height: 100, fps: 12, pixel: false, pixelSize: 8 }).length).toBe(24);
  });
});

describe('isOnePicture', () => {
  it('is pixel art with one frame on one board', () => {
    expect(isOnePicture(preset('tiny-sprite'))).toBe(true);
    expect(isOnePicture(makeBlankPixel())).toBe(false);
    expect(isOnePicture(newDoc({ length: 1 }))).toBe(false); // a vector page is not pixel art
    const two = preset('tiny-sprite');
    addArtboard(two);
    addArtboard(two);
    expect(isOnePicture(two)).toBe(false);
  });
});

function rig(doc: Doc, pixelWs = true) {
  let cur = doc;
  const subs = new Set<() => void>();
  const dockSubs = new Set<() => void>();
  const log: string[] = [];
  let open = true;
  let ws = pixelWs;
  const dock: PreviewDock = {
    inPixelWorkspace: () => ws,
    previewOpen: () => open,
    hidePreview: () => ((open = false), void log.push('hide')),
    showPreview: () => ((open = true), void log.push('show')),
    subscribe: (f) => (dockSubs.add(f), () => void dockSubs.delete(f)),
  };
  const off = watchOnePicture({ get: () => ({ doc: cur }), subscribe: (f) => (subs.add(f), () => void subs.delete(f)) }, dock);
  return {
    log,
    off,
    isOpen: () => open,
    load: (d: Doc) => ((cur = d), subs.forEach((f) => f())),
    edit: (fn: (d: Doc) => void) => ((cur = structuredClone(cur)), fn(cur), subs.forEach((f) => f())),
    reopen: () => ((open = true), dockSubs.forEach((f) => f())),
    workspace: (on: boolean) => ((ws = on), dockSubs.forEach((f) => f())),
  };
}

describe('the Preview and one picture', () => {
  it('stays away for a one-picture file', () => {
    const r = rig(preset('tiny-sprite'));
    expect(r.log).toEqual(['hide']);
    expect(r.isOpen()).toBe(false);
  });
  it('comes forward by itself when a second frame is added, once', () => {
    const r = rig(preset('tiny-sprite'));
    r.edit((d) => void (d.length = 2));
    expect(r.log).toEqual(['hide', 'show']);
    r.edit((d) => void (d.length = 1)); // undo: it does not jump away again
    expect(r.log).toEqual(['hide', 'show']);
  });
  it('comes forward for a second board too', () => {
    const r = rig(preset('tiny-sprite'));
    r.edit((d) => void addArtboard(d));
    expect(r.log).toEqual(['hide', 'show']);
  });
  it('an animation keeps its Preview, and a one-picture file you open it on stays as you left it', () => {
    const r = rig(makeBlankPixel());
    expect(r.log).toEqual([]);
    const one = rig(preset('tiny-sprite'));
    one.reopen();
    one.edit((d) => void d.layers.length);
    expect(one.isOpen()).toBe(true);
    expect(one.log).toEqual(['hide']);
  });
  it('waits for the Pixel workspace, and each document is decided once', () => {
    const r = rig(preset('tiny-sprite'), false);
    expect(r.log).toEqual([]);
    r.workspace(true);
    expect(r.log).toEqual(['hide']);
    r.reopen();
    r.workspace(false);
    r.workspace(true);
    expect(r.log).toEqual(['hide']);
  });
  it('a different one-picture document is decided afresh', () => {
    const r = rig(preset('tiny-sprite'));
    r.reopen();
    r.load(preset('game-sprite'));
    expect(r.log).toEqual(['hide', 'hide']);
  });
});

describe('a one-picture file can still grow into an animation', () => {
  it('Copy this drawing to the next frame adds the second frame', async () => {
    const { resetStore, store } = await import('../../src/core/store');
    const { getCommand } = await import('../../src/core/registry');
    await import('../../src/timeline');
    await import('../../src/pixel');
    const { pixelDrawing, hold } = await import('../../src/templates/build');
    const doc = preset('tiny-sprite');
    const layer = doc.layers[0];
    hold(layer, pixelDrawing(doc, Array.from({ length: 32 }, () => '.'.repeat(32)), {}).id, 0);
    resetStore(doc);
    expect(store().get().doc.length).toBe(1);
    getCommand('timeline.duplicateKey')!.run();
    expect(store().get().doc.length).toBe(2);
    expect(store().get().ui.frame).toBe(1);
  });
});
