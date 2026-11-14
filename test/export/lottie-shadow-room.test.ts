// lottie-web's SVG player cuts a Drop Shadow off at the layer's own box, so a shadow thrown past a small drawing
// vanishes there. The Lottie writer gives a shadowed layer an invisible rectangle the size of what it draws plus the
// shadow's reach (scripts/e2e/shadow-clip.cjs plays the files in lottie-web and the dotLottie player and compares them with
// the editor). These tests pin the box.
import { describe, expect, it } from 'vitest';
import type { Doc, InstanceShape, LayerEffect } from '../../src/core/format';
import { newDoc, uid } from '../../src/core/doc';
import { effectReach } from '../../src/core/render';
import { defaultValues } from '../../src/effects/model';
import { lottieExport } from '../../src/export/lottie';
import { addPixelLayer, addVectorLayer, ellipsePath, fill, hold, pixelDrawing, rectPath, vectorDrawing } from '../../src/templates/build';

type Json = any;
const fx = (kind: LayerEffect['kind'], values: Record<string, number | string> = {}): LayerEffect => ({ id: uid('e'), kind, values: { ...defaultValues(kind), ...values } });
const SHADOW = { x: 34, y: -24, softness: 5, opacity: 0.8 };
const REACH = effectReach('shadow', SHADOW);

const fresh = (length = 8): Doc => {
  const doc = newDoc({ width: 300, height: 200, length, fps: 12 });
  doc.layers = [];
  return doc;
};

/** Every invisible room rectangle in a layer list (and the precomps it uses), as boxes. */
function rooms(data: Json, layers: Json[] = data.layers): { x0: number; y0: number; x1: number; y1: number; layer: Json }[] {
  const out: { x0: number; y0: number; x1: number; y1: number; layer: Json }[] = [];
  const walk = (items: Json[], layer: Json) => {
    for (const it of items) {
      if (it.ty !== 'gr') continue;
      if (it.nm === 'Shadow room') {
        const rc = it.it.find((i: Json) => i.ty === 'rc');
        const fl = it.it.find((i: Json) => i.ty === 'fl');
        expect(fl.o.k).toBe(0);
        const [cx, cy] = rc.p.k;
        const [w, h] = rc.s.k;
        out.push({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2, layer });
      } else walk(it.it, layer);
    }
  };
  for (const l of layers) {
    if (l.ty === 4) walk(l.shapes ?? [], l);
    if (l.ty === 0) out.push(...rooms(data, data.assets.find((a: Json) => a.id === l.refId)?.layers ?? []));
  }
  return out;
}

const covers = (b: { x0: number; y0: number; x1: number; y1: number }, x0: number, y0: number, x1: number, y1: number) => b.x0 <= x0 && b.y0 <= y0 && b.x1 >= x1 && b.y1 >= y1;

describe('Lottie shadow room', () => {
  it('a shape layer with a shadow holds an invisible rectangle over its drawing and the shadow, bottom and top', () => {
    const doc = fresh();
    const l = addVectorLayer(doc, 'Box');
    l.effects = [fx('shadow', SHADOW)];
    hold(l, vectorDrawing(doc, [fill([rectPath(40, 60, 60, 44)], '#5ab8ff')]).id, 0, 8);
    const { data } = lottieExport(doc);
    const layer = data.layers.find((x: Json) => x.nm === 'Box');
    expect(layer.ef[0].ty).toBe(25);
    const [room, ...more] = rooms(data);
    expect(more).toEqual([]);
    expect(room.layer).toBe(layer);
    // The drawing, the drawing moved by the shadow's offset (both ways here) and three sigmas of blur all fit.
    expect(covers(room, 40, 60, 100, 104)).toBe(true);
    expect(covers(room, 40 + SHADOW.x - 15, 60 + SHADOW.y - 15, 100 + SHADOW.x + 15, 104 + SHADOW.y + 15)).toBe(true);
    // ...and it doesn't grow past the reach (two pixels of margin).
    expect(room.x1).toBeLessThanOrEqual(100 + REACH + 2);
    expect(room.y0).toBeGreaterThanOrEqual(60 - REACH - 2);
  });

  it('is not written for layers without a shadow', () => {
    const doc = fresh();
    const a = addVectorLayer(doc, 'Plain');
    hold(a, vectorDrawing(doc, [fill([rectPath(10, 10, 40, 40)], '#ff6f91')]).id, 0, 8);
    const b = addVectorLayer(doc, 'Soft');
    b.effects = [fx('blur', { radius: 4 })];
    hold(b, vectorDrawing(doc, [fill([rectPath(80, 10, 40, 40)], '#ff6f91')]).id, 0, 8);
    const c = addVectorLayer(doc, 'Glow');
    c.effects = [fx('glow', { size: 8 })];
    hold(c, vectorDrawing(doc, [fill([rectPath(150, 10, 40, 40)], '#ff6f91')]).id, 0, 8);
    expect(JSON.stringify(lottieExport(doc).data)).not.toContain('Shadow room');
  });

  it('covers every place a layer draws while it holds different drawings', () => {
    const doc = fresh();
    const l = addVectorLayer(doc, 'Hop');
    l.effects = [fx('shadow', SHADOW)];
    hold(l, vectorDrawing(doc, [fill([rectPath(30, 40, 40, 40)], '#9b7bff')]).id, 0, 4);
    hold(l, vectorDrawing(doc, [fill([rectPath(200, 100, 40, 40)], '#9b7bff')]).id, 4, 4);
    const { data } = lottieExport(doc);
    const found = rooms(data);
    expect(found.length).toBeGreaterThan(0);
    for (const r of found) expect(covers(r, 30, 40, 240 + SHADOW.x, 140)).toBe(true);
  });

  it('a folder shadow covers everything in the folder', () => {
    const doc = fresh();
    doc.folders = { f1: { id: 'f1', name: 'Pair', visible: true, opacity: 1, effects: [fx('shadow', SHADOW)] } };
    const a = addVectorLayer(doc, 'A');
    a.folder = 'f1';
    hold(a, vectorDrawing(doc, [fill([rectPath(40, 40, 40, 40)], '#4fd1a5')]).id, 0, 8);
    const b = addVectorLayer(doc, 'B');
    b.folder = 'f1';
    hold(b, vectorDrawing(doc, [fill([ellipsePath(160, 120, 20, 20)], '#ffc94a')]).id, 0, 8);
    const found = rooms(lottieExport(doc).data);
    expect(found.length).toBeGreaterThan(0);
    for (const r of found) expect(covers(r, 40, 40, 180 + REACH, 140)).toBe(true);
  });

  it('a symbol copy or a pixel layer with a shadow goes in a precomp that holds the room', () => {
    const doc = fresh();
    const inner = addVectorLayer(doc, 'Disc');
    hold(inner, vectorDrawing(doc, [fill([ellipsePath(0, 0, 18, 18)], '#ff6f91')]).id, 0, 1);
    doc.symbols = { disc: { id: 'disc', name: 'Disc', layers: doc.layers, length: 1, origin: { x: 0, y: 0 } } };
    doc.layers = [];
    const copy = addVectorLayer(doc, 'Copy');
    copy.effects = [fx('shadow', SHADOW)];
    const inst: InstanceShape = { id: 'i1', type: 'instance', symbolId: 'disc', transform: { x: 70, y: 60, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, opacity: 1, play: 'loop', firstFrame: 0 };
    const d = vectorDrawing(doc, []);
    d.shapes = [inst];
    hold(copy, d.id, 0, 8);
    const sprite = addPixelLayer(doc, 'Sprite', 6);
    sprite.effects = [fx('shadow', SHADOW)];
    hold(sprite, pixelDrawing(doc, ['.##.', '####', '####', '.##.'], { '#': '#5ab8ff' }).id, 0, 8);
    const { data } = lottieExport(doc);
    for (const name of ['Copy', 'Sprite']) {
      const wrapper = data.layers.find((x: Json) => x.nm === name);
      expect(wrapper.ty).toBe(0);
      expect(wrapper.ef[0].ty).toBe(25);
      const inside = data.assets.find((a: Json) => a.id === wrapper.refId).layers;
      expect(inside.some((x: Json) => x.nm === 'Shadow room')).toBe(true);
    }
    // The copy's room covers the disc (52..88, 42..78) and its shadow.
    const around = rooms(data).find((r) => r.x0 < 52 && r.x0 > -200 && covers(r, 52, 42, 88 + SHADOW.x, 78));
    expect(around).toBeTruthy();
  });

  it('adds only a few hundred bytes to a shadowed layer', () => {
    const doc = fresh();
    const l = addVectorLayer(doc, 'Box');
    hold(l, vectorDrawing(doc, [fill([rectPath(40, 60, 60, 44)], '#5ab8ff')]).id, 0, 8);
    const plain = JSON.stringify(lottieExport(doc).data).length;
    l.effects = [fx('shadow', SHADOW)];
    const withShadow = JSON.stringify(lottieExport(doc).data).length;
    l.effects = [fx('shadow', SHADOW)];
    const noRoom = JSON.stringify(lottieExport(doc).data).replace(/,\{"ty":"gr","nm":"Shadow room".*?\{"ty":"tr".*?\}\]\}/, '').length;
    expect(withShadow - noRoom).toBeLessThan(400);
    expect(withShadow).toBeGreaterThan(plain);
  });

  it('shadow and soften on one layer still get the room, whichever comes first', () => {
    for (const stack of [[fx('shadow', SHADOW), fx('blur', { radius: 2 })], [fx('blur', { radius: 2 }), fx('shadow', SHADOW)]]) {
      const doc = fresh();
      const l = addVectorLayer(doc, 'Box');
      l.effects = stack;
      hold(l, vectorDrawing(doc, [fill([rectPath(40, 60, 60, 44)], '#5ab8ff')]).id, 0, 8);
      const found = rooms(lottieExport(doc).data);
      expect(found).toHaveLength(1);
      expect(covers(found[0], 40, 60, 100 + SHADOW.x, 104)).toBe(true);
    }
  });
});
