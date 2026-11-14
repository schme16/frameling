// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import '../../src/timeline';
import '../../src/export';
import { rigFeature } from '../../src/rig';
import { tilesFeature } from '../../src/tiles';
import '../../src/artboards';
import '../../src/pixel';
import { cameraFeature } from '../../src/camera';
import { particlesFeature } from '../../src/particles';
import { textFeature } from '../../src/text';
import { registerFeatures } from '../../src/features/host';

// The lessons run commands that the optional features add.
registerFeatures([cameraFeature, particlesFeature, rigFeature, textFeature, tilesFeature]);
import { PIXEL_WAY_QUESTS } from '../../src/pixel/quests-ways';
import { getCommand } from '../../src/core/registry';
import { syncDynamicCommands } from '../../src/ui/dynamic';
import { resetStore } from '../../src/core/store';
import { makeBouncingBall } from '../../src/templates/bouncing-ball';
import { setFillOptions } from '../../src/tools/fill-options';
import { setScheduler } from '../../src/timeline/playback';
import { overlays } from '../../src/ui/overlays';
import { ensureBlankVectorPage, ensureTinySpritePage } from '../../src/quests/actions';
import { BOUNCING_BALL, FILL_IT_IN, FIRST_ANIMATION, PIXEL_PAL, QUESTS, SHARE_IT } from '../../src/quests/library';
import { readProbe } from '../../src/quests/probe';
import { allQuests, isUnlocked } from '../../src/quests/registry';
import { FRESH_PROGRESS, NO_PROBE, type Quest, type StepCtx } from '../../src/quests/types';
import { PRESETS, docFromPreset } from '../../src/ui/presets';
import { TILES_QUEST, drawDemoWave, ensureTilePage, onWholeGrid, paintsAcrossEdge, stampedTiles } from '../../src/tiles/quest';
import { editingTileKey, finishTileEdit } from '../../src/tiles/tileEdit';
import { newDoc, newPixelDrawing, newTilemapDrawing, newTilemapLayer } from '../../src/core/doc';
import { makeCell } from '../../src/tiles/model';
import { ctxFor, pixelDoc, putPixels, putShapes, ring, rig, stroke, vectorDoc } from './helpers';

beforeEach(() => {
  // Playback would otherwise run on real timers after the test is over.
  setScheduler({ now: () => 0, request: () => 0, cancel: () => {} });
  setFillOptions({ gap: 'small' });
  overlays.set((o) => ({ ...o, sheet: null }));
});

/** The step by id. */
const step = (q: Quest, id: string) => q.steps.find((s) => s.id === id)!;
const stateOf = (doc = vectorDoc()) => resetStore(doc).get();

/** Lets "Show me how" do every step, and checks the quest finishes with its badge. */
async function playThrough(q: Quest, r: ReturnType<typeof rig>) {
  expect(r.engine.start(q.id)).toBe(true);
  for (let i = 0; i < q.steps.length + 2 && r.progress.get().active; i++) await r.engine.showMe();
  expect(r.progress.get()).toMatchObject({ active: null, completed: [q.id], badges: [q.badge!.id] });
}

describe('the quests', () => {
  it('are registered, in order, with unique ids, steps and badges', () => {
    expect(allQuests().map((q) => q.id)).toEqual(['first-animation', 'bouncing-ball', 'fill-it-in', 'pixel-pal', 'shade-and-shine', 'tiles', 'first-tween', 'share-it', 'bones-and-pose', 'make-it-glow', 'particle-party', 'say-it-with-text', 'camera-move', 'one-tiny-picture', 'board-by-board', 'cast-on-a-sheet']);
    expect(new Set(QUESTS.map((q) => q.badge!.id)).size).toBe(16);
    expect(QUESTS.map((q) => q.badge!.name)).toEqual(['Flipbooker', 'Squash & Stretch', 'Paint Pot', 'Pixel Pal', 'Shade Maker', 'Level Builder', 'Smooth Mover', 'Showtime', 'Puppeteer', 'Lamplighter', 'Confetti Cannon', 'Wordsmith', 'Director', 'Icon Maker', 'Storyboarder', 'Sheet Master']);
    for (const q of QUESTS) {
      expect(new Set(q.steps.map((s) => s.id)).size).toBe(q.steps.length);
      for (const s of q.steps) {
        expect(s.say.length, `${q.id}/${s.id}`).toBeGreaterThan(5);
        expect(typeof s.done, `${q.id}/${s.id} has a check`).toBe('function');
        expect(s.say, 'no em dashes').not.toMatch(/—/);
      }
    }
  });

  it('every command a step runs exists, and every string selector parses', () => {
    syncDynamicCommands();
    for (const q of QUESTS)
      for (const s of q.steps) {
        if (typeof s.show === 'string') expect(getCommand(s.show), `${q.id}/${s.id}: ${s.show}`).toBeTruthy();
        const t = s.target;
        if (typeof t === 'string' || Array.isArray(t)) for (const sel of [t].flat()) expect(() => document.querySelector(sel as string)).not.toThrow();
      }
  });

  it('the first quests are open from the start (Pixel pal is a sprite person\'s first), the others wait', () => {
    const p = { ...FRESH_PROGRESS };
    expect(isUnlocked(FIRST_ANIMATION, p)).toBe(true);
    for (const q of QUESTS.slice(1)) expect(isUnlocked(q, p)).toBe(q.id === 'pixel-pal' || q.id === 'tiles' || PIXEL_WAY_QUESTS.includes(q));
    for (const q of QUESTS.slice(1)) expect(isUnlocked(q, { ...p, completed: ['first-animation'] })).toBe(true);
  });
});

describe('Your first animation', () => {
  it('draw: ink on the first frame', () => {
    const d = vectorDoc();
    const s = step(FIRST_ANIMATION, 'draw');
    expect(s.done!(ctxFor(stateOf(d)))).toBe(false);
    putShapes(d, d.layers[0], 3, [stroke(ring())]);
    expect(s.done!(ctxFor(stateOf(d)))).toBe(false);
    putShapes(d, d.layers[0], 0, [stroke(ring())]);
    expect(s.done!(ctxFor(stateOf(d)))).toBe(true);
  });

  it('next frame: its own drawing on frame 2, not a hold', () => {
    const s = step(FIRST_ANIMATION, 'next-frame');
    const held = vectorDoc();
    putShapes(held, held.layers[0], 0, [stroke(ring())], 2);
    expect(s.done!(ctxFor(stateOf(held)))).toBe(false);
    const own = vectorDoc();
    putShapes(own, own.layers[0], 0, [stroke(ring())]);
    putShapes(own, own.layers[0], 1, [stroke(ring())]);
    expect(s.done!(ctxFor(stateOf(own)))).toBe(true);
  });

  it('change: frame 2 differs from frame 1', () => {
    const s = step(FIRST_ANIMATION, 'change');
    const same = vectorDoc();
    putShapes(same, same.layers[0], 0, [stroke(ring())]);
    putShapes(same, same.layers[0], 1, [stroke(ring())]);
    expect(s.done!(ctxFor(stateOf(same)))).toBe(false);
    const diff = vectorDoc();
    putShapes(diff, diff.layers[0], 0, [stroke(ring())]);
    putShapes(diff, diff.layers[0], 1, [stroke(ring(240, 150))]);
    expect(s.done!(ctxFor(stateOf(diff)))).toBe(true);
  });

  it('change: turns onion skin on for the person when the step begins', () => {
    const st = resetStore(vectorDoc());
    expect(st.get().ui.onion.enabled).toBe(false);
    step(FIRST_ANIMATION, 'change').enter!();
    expect(st.get().ui.onion.enabled).toBe(true);
  });

  it('play: when playback starts', () => {
    const st = resetStore(vectorDoc());
    const s = step(FIRST_ANIMATION, 'play');
    expect(s.done!(ctxFor(st.get()))).toBe(false);
    st.setUi({ playing: true });
    expect(s.done!(ctxFor(st.get()))).toBe(true);
  });

  it('can be finished with nothing but Show me', async () => {
    const r = rig([FIRST_ANIMATION], vectorDoc(), undefined, { run: true, probe: readProbe });
    await playThrough(FIRST_ANIMATION, r);
    const { doc, ui } = r.store.get();
    expect(ui.onion.enabled).toBe(true);
    // The timeline was trimmed to the two drawings, so it does not loop through blank frames.
    // Two drawings, each held on twos, so the loop is 4 frames.
    expect(doc.length).toBe(4);
    expect(doc.layers[0].cels.map((c) => [c.start, c.length])).toEqual([[0, 2], [2, 2]]);
  });

  it('can be finished by hand through the real commands', () => {
    const r = rig([FIRST_ANIMATION], vectorDoc(), undefined, { run: true, probe: readProbe });
    r.engine.start('first-animation');
    r.store.update('Draw stroke', (d) => void putShapes(d as never, d.layers[0] as never, 0, [stroke(ring())]));
    expect(r.progress.get().step).toBe(1);
    getCommand('timeline.duplicateKey')!.run();
    expect(r.progress.get().step).toBe(2);
    // Move the ball a little on frame 2.
    r.store.update('Draw stroke', (d) => {
      const dr = d.drawings[d.layers[0].cels[1].drawingId] as { shapes: { points: { x: number }[] }[] };
      for (const p of dr.shapes[0].points) p.x += 50;
    });
    expect(r.progress.get().step).toBe(3);
    getCommand('timeline.play')!.run();
    expect(r.progress.get().badges).toEqual(['flipbooker']);
  });

  it('keeps an empty page, and replaces a used one only after the question', async () => {
    resetStore(vectorDoc());
    expect(ensureBlankVectorPage()).toBe(true);
    const used = vectorDoc();
    putShapes(used, used.layers[0], 0, [stroke(ring())]);
    const st = resetStore(used);
    const r = ensureBlankVectorPage();
    expect(r).toBeInstanceOf(Promise);
    expect(await r).toBe(true);
    expect(st.get().doc.layers.some((l) => l.cels.length)).toBe(false);
    expect(st.get().doc.width).toBe(1280);
  });
});

describe('Bouncing ball', () => {
  it('open: the template is the ball (and nothing else is)', () => {
    const s = step(BOUNCING_BALL, 'open');
    expect(s.done!(ctxFor(stateOf(vectorDoc())))).toBe(false);
    expect(s.done!(ctxFor(stateOf(makeBouncingBall())))).toBe(true);
  });

  it('open: shows the examples sheet unless the ball is already open', () => {
    resetStore(vectorDoc());
    step(BOUNCING_BALL, 'open').enter!();
    expect(overlays.get().sheet).toBe('examples');
    overlays.set((o) => ({ ...o, sheet: null }));
    resetStore(makeBouncingBall());
    step(BOUNCING_BALL, 'open').enter!();
    expect(overlays.get().sheet).toBeNull();
  });

  it('scrub: four different frames', () => {
    const s = step(BOUNCING_BALL, 'scrub');
    const st = stateOf(makeBouncingBall());
    expect(s.done!(ctxFor(st, { frames: new Set([0, 1, 2]) }))).toBe(false);
    expect(s.done!(ctxFor(st, { frames: new Set([0, 1, 2, 3]) }))).toBe(true);
  });

  it('squash: the contact frame, and no other', () => {
    const s = step(BOUNCING_BALL, 'squash');
    const st = resetStore(makeBouncingBall());
    st.setUi({ frame: 7 });
    expect(s.done!(ctxFor(st.get()))).toBe(false);
    st.setUi({ frame: 8 });
    expect(s.done!(ctxFor(st.get()))).toBe(true);
  });

  it('hold: any change to how long a drawing stays up', () => {
    const s = step(BOUNCING_BALL, 'hold');
    const st = resetStore(makeBouncingBall());
    const entry = st.get();
    expect(s.done!(ctxFor(st.get(), { entry: { state: entry, probe: NO_PROBE } }))).toBe(false);
    st.setUi({ frame: 8 });
    expect(s.done!(ctxFor(st.get(), { entry: { state: entry, probe: NO_PROBE } }))).toBe(false);
    getCommand('timeline.hold2')!.run();
    expect(s.done!(ctxFor(st.get(), { entry: { state: entry, probe: NO_PROBE } }))).toBe(true);
  });

  it('can be finished with nothing but Show me', async () => {
    const r = rig([BOUNCING_BALL], vectorDoc(), undefined, { run: true, probe: readProbe });
    await playThrough(BOUNCING_BALL, r);
    expect(r.store.get().doc.name).toBe('Bouncing ball');
  });

  it('can be picked up from a ball opened before the quest', () => {
    const r = rig([BOUNCING_BALL], makeBouncingBall(), undefined, { run: true, probe: readProbe });
    r.engine.start('bouncing-ball');
    expect(r.progress.get().step).toBe(1);
    expect(BOUNCING_BALL.ready!(r.store.get())).toBe(true);
  });
});

describe('Fill it in', () => {
  it('shape: a closed outline, not an open line', () => {
    const s = step(FILL_IT_IN, 'shape');
    const open = vectorDoc();
    putShapes(open, open.layers[0], 0, [stroke(ring(200, 150, 60, false))]);
    expect(s.done!(ctxFor(stateOf(open)))).toBe(false);
    const closed = vectorDoc();
    putShapes(closed, closed.layers[0], 0, [stroke(ring())]);
    expect(s.done!(ctxFor(stateOf(closed)))).toBe(true);
  });

  it('bucket: the fill tool is picked', () => {
    const st = resetStore(vectorDoc());
    const s = step(FILL_IT_IN, 'bucket');
    expect(s.done!(ctxFor(st.get()))).toBe(false);
    st.setUi({ tool: 'fill' });
    expect(s.done!(ctxFor(st.get()))).toBe(true);
  });

  it('fill: a Fill edit, or recolouring a fill', () => {
    const s = step(FILL_IT_IN, 'fill');
    const st = stateOf();
    expect(s.done!(ctxFor(st, { edits: ['Draw stroke'] }))).toBe(false);
    expect(s.done!(ctxFor(st, { edits: ['Draw stroke', 'Fill'] }))).toBe(true);
    expect(s.done!(ctxFor(st, { edits: ['Recolour fill'] }))).toBe(true);
  });

  it('gap: only when the Close gaps choice changes from where it started', () => {
    const s = step(FILL_IT_IN, 'gap');
    const st = stateOf();
    const entry = { state: st, probe: { ...NO_PROBE, fillGap: 'small' } };
    expect(s.done!(ctxFor(st, { entry, probe: { ...NO_PROBE, fillGap: 'small' } }))).toBe(false);
    expect(s.done!(ctxFor(st, { entry, probe: { ...NO_PROBE, fillGap: 'large' } }))).toBe(true);
    expect(s.done!(ctxFor(st, { entry, probe: { ...NO_PROBE, fillGap: null } }))).toBe(false);
  });

  it('reads the real gap setting through the probe', () => {
    expect(readProbe().fillGap).toBe('small');
    setFillOptions({ gap: 'medium' });
    expect(readProbe().fillGap).toBe('medium');
  });

  it('can be finished with nothing but Show me', async () => {
    const r = rig([FILL_IT_IN], vectorDoc({ width: 800, height: 600 }), undefined, { run: true, probe: readProbe });
    await playThrough(FILL_IT_IN, r);
    expect(readProbe().fillGap).not.toBe('small');
  });
});

describe('Pixel pal', () => {
  it('draw: six or more pixels', () => {
    const s = step(PIXEL_PAL, 'draw');
    const d = pixelDoc();
    putPixels(d, d.layers[0], 0, [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1]]);
    expect(s.done!(ctxFor(stateOf(d)))).toBe(false);
    const e = pixelDoc();
    putPixels(e, e.layers[0], 0, [[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1]]);
    expect(s.done!(ctxFor(stateOf(e)))).toBe(true);
  });

  it('fill: needs the bucket, not just pixels', () => {
    const s = step(PIXEL_PAL, 'fill');
    expect(s.done!(ctxFor(stateOf(pixelDoc()), { edits: ['Draw pixels'] }))).toBe(false);
    expect(s.done!(ctxFor(stateOf(pixelDoc()), { edits: ['Draw pixels', 'Fill'] }))).toBe(true);
  });

  it('two frames: a copy, then a change', () => {
    const copy = step(PIXEL_PAL, 'copy');
    const change = step(PIXEL_PAL, 'change');
    const one = pixelDoc();
    putPixels(one, one.layers[0], 0, [[1, 1], [2, 2]]);
    expect(copy.done!(ctxFor(stateOf(one)))).toBe(false);
    const two = pixelDoc();
    putPixels(two, two.layers[0], 0, [[1, 1], [2, 2]]);
    putPixels(two, two.layers[0], 1, [[1, 1], [2, 2]]);
    expect(copy.done!(ctxFor(stateOf(two)))).toBe(true);
    expect(change.done!(ctxFor(stateOf(two)))).toBe(false);
    const diff = pixelDoc();
    putPixels(diff, diff.layers[0], 0, [[1, 1], [2, 2]]);
    putPixels(diff, diff.layers[0], 1, [[1, 1], [3, 3]]);
    expect(change.done!(ctxFor(stateOf(diff)))).toBe(true);
  });

  it('starts on a Tiny sprite page', async () => {
    const st = resetStore(vectorDoc());
    expect(await ensureTinySpritePage()).toBe(true);
    const tiny = docFromPreset(PRESETS.find((p) => p.id === 'tiny-sprite')!);
    expect(st.get().doc.width).toBe(tiny.width);
    expect(st.get().doc.layers[0].kind).toBe('pixel');
    expect(ensureTinySpritePage()).toBe(true);
  });

  it('can be finished with nothing but Show me', async () => {
    const r = rig([PIXEL_PAL], newDoc({ ...docFromPreset(PRESETS.find((p) => p.id === 'tiny-sprite')!), pixel: { pixelSize: 16 } }), undefined, { run: true, probe: readProbe });
    await playThrough(PIXEL_PAL, r);
    expect(r.store.get().doc.layers[0].cels.length).toBe(2);
  });
});

describe('Tiles', () => {
  it('starts on a Game sprite page, and keeps an empty one', async () => {
    const st = resetStore(vectorDoc());
    expect(await ensureTilePage()).toBe(true);
    expect(st.get().doc.width).toBe(docFromPreset(PRESETS.find((p) => p.id === 'game-sprite')!).width);
    expect(st.get().doc.layers[0].kind).toBe('pixel');
    expect(ensureTilePage()).toBe(true);
  });

  it('edge: paint at both ends of a row or column, but not a tile painted all over', () => {
    const d = newPixelDrawing(4, 4);
    const put = (x: number, y: number) => d.pixels.set([0, 0, 0, 255], (y * 4 + x) * 4);
    put(1, 1);
    expect(paintsAcrossEdge(d)).toBe(false);
    put(0, 2);
    expect(paintsAcrossEdge(d)).toBe(false);
    put(3, 2);
    expect(paintsAcrossEdge(d)).toBe(true);
    const v = newPixelDrawing(4, 4);
    v.pixels.set([0, 0, 0, 255], (0 * 4 + 2) * 4);
    v.pixels.set([0, 0, 0, 255], (3 * 4 + 2) * 4);
    expect(paintsAcrossEdge(v)).toBe(true);
    v.pixels.fill(255);
    expect(paintsAcrossEdge(v)).toBe(false);
  });

  it('edge: a drawing holding only its painted block is judged on the whole tile', () => {
    const doc = newDoc({ width: 16, height: 16, pixel: { pixelSize: 1 } });
    const layer = doc.layers.find((l) => l.kind === 'pixel')!;
    if (layer.kind !== 'pixel') throw new Error('pixel layer needed');
    // Paint at both ends of a 6 x 1 block that sits well inside the tile: it never reaches either edge.
    const d = newPixelDrawing(6, 1);
    d.x = 5;
    d.y = 8;
    d.pixels.set([0, 0, 0, 255], 0);
    d.pixels.set([0, 0, 0, 255], 5 * 4);
    expect(paintsAcrossEdge(d)).toBe(true);
    expect(paintsAcrossEdge(onWholeGrid(doc, layer, d))).toBe(false);
    // Paint on both edges of the tile does count.
    const across = newPixelDrawing(16, 1);
    across.y = 8;
    across.pixels.set([0, 0, 0, 255], 0);
    across.pixels.set([0, 0, 0, 255], 15 * 4);
    expect(paintsAcrossEdge(onWholeGrid(doc, layer, across))).toBe(true);
  });

  it('show me the wave: paints right across the tile even when the drawing holds only a small block', () => {
    const doc = newDoc({ width: 16, height: 16, pixel: { pixelSize: 1 } });
    const layer = doc.layers.find((l) => l.kind === 'pixel')!;
    if (layer.kind !== 'pixel') throw new Error('pixel layer needed');
    const id = putPixels(doc, layer, 0, [[5, 5]]);
    const st = resetStore(doc);
    const small = st.get().doc.drawings[id] as ReturnType<typeof newPixelDrawing>;
    small.x = 5;
    small.y = 5;
    small.width = 1;
    small.height = 1;
    small.pixels = small.pixels.slice(0, 4);
    st.setUi({ activeLayerId: layer.id });
    expect(drawDemoWave()).toBe(true);
    const out = st.get().doc.drawings[id] as ReturnType<typeof newPixelDrawing>;
    expect(out.width).toBe(16);
    expect(paintsAcrossEdge(onWholeGrid(st.get().doc, layer, out))).toBe(true);
  });

  it('stamp: counts tiles on the tilemap layer', () => {
    const doc = vectorDoc();
    const layer = newTilemapLayer('Tiles', 1);
    const map = newTilemapDrawing(4, 2);
    map.cells[0] = makeCell(1);
    map.cells[1] = makeCell(1);
    doc.drawings[map.id] = map;
    layer.cels.push({ id: 'c', start: 0, length: 1, drawingId: map.id });
    doc.layers.push(layer);
    const s = stateOf(doc);
    expect(stampedTiles(s)).toBe(2);
    expect(TILES_QUEST.steps.find((x) => x.id === 'stamp')!.done!(ctxFor(s))).toBe(false);
  });

  it('can be finished with nothing but Show me, leaving a seamless tile stamped on a map', async () => {
    const r = rig([TILES_QUEST], docFromPreset(PRESETS.find((p) => p.id === 'game-sprite')!), undefined, { run: true, probe: readProbe });
    await playThrough(TILES_QUEST, r);
    expect(editingTileKey()).toBe(0);
    const doc = r.store.get().doc;
    const tile = doc.tileset!.tiles[0];
    expect(paintsAcrossEdge(doc.drawings[tile.frames[0].drawingId] as never)).toBe(true);
    expect(stampedTiles(r.store.get())).toBeGreaterThanOrEqual(3);
    finishTileEdit();
  });
});

describe('Share it', () => {
  it('open: needs the dialog on screen', () => {
    const s = step(SHARE_IT, 'open');
    expect(s.done!(ctxFor(stateOf()))).toBe(false);
    expect(s.done!(ctxFor(stateOf(), { probe: { ...NO_PROBE, exportOpen: true } }))).toBe(true);
  });

  it('gif: done only with the dialog open and GIF chosen, so nothing is ever saved', () => {
    const s = step(SHARE_IT, 'gif');
    const at = (exportOpen: boolean, exportFormat: string | null) => s.done!(ctxFor(stateOf(), { probe: { ...NO_PROBE, exportOpen, exportFormat } }));
    expect(at(true, 'mp4')).toBe(false);
    expect(at(false, 'gif')).toBe(false);
    expect(at(true, 'gif')).toBe(true);
  });

  it('is finished by opening Export and choosing GIF', () => {
    const r = rig([SHARE_IT]);
    r.engine.start('share-it');
    r.probe.value = { ...NO_PROBE, exportOpen: true, exportFormat: 'mp4' };
    r.engine.tick();
    expect(r.progress.get().step).toBe(1);
    r.probe.value = { ...NO_PROBE, exportOpen: true, exportFormat: 'gif' };
    r.engine.tick();
    expect(r.progress.get().badges).toEqual(['showtime']);
  });

  it('reads the open export dialog from the page', () => {
    document.body.innerHTML = `<div role="radiogroup" aria-label="Format">
      <button role="radio" aria-checked="false">MP4 video H.264 Sharing</button>
      <button role="radio" aria-checked="true">Animated GIF GIF Chats and forums</button>
      <button role="radio" aria-checked="false">Animated PNG APNG Sharper than a GIF</button></div>`;
    expect(readProbe()).toMatchObject({ exportOpen: true, exportFormat: 'gif' });
    document.body.innerHTML = '';
    expect(readProbe()).toMatchObject({ exportOpen: false, exportFormat: null });
  });
});

// Keep the ctx type honest for anyone adding a field.
const _typecheck: StepCtx | null = null;
void _typecheck;
