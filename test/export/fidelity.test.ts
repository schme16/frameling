import { describe, expect, it } from 'vitest';
import type { Doc, InstanceShape, LayerEffect } from '../../src/core/format';
import { newDoc, uid } from '../../src/core/doc';
import { makeSymbol } from '../../src/core/symbols';
import { defaultValues } from '../../src/effects/model';
import { newParticles } from '../../src/particles/model';
import { lottieExport, smoothTrack } from '../../src/export/lottie';
import { animatedSvg, animatedSvgExport } from '../../src/export/svg-anim';
import { frameToSvg } from '../../src/export/svg';
import { carryOf, carryWarnings, docFeatures } from '../../src/export/carries';
import { allFormats } from '../../src/export/types';
import { addVectorLayer, ellipsePath, fill, hold, rectPath, vectorDrawing } from '../../src/templates/build';

const fx = (kind: LayerEffect['kind'], values: Record<string, number | string> = {}): LayerEffect => ({ id: uid('e'), kind, values: { ...defaultValues(kind), ...values } });

function base(): Doc {
  const doc = newDoc({ width: 100, height: 80, length: 4, fps: 12 });
  doc.layers = [];
  const back = addVectorLayer(doc, 'Back');
  hold(back, vectorDrawing(doc, [fill([rectPath(0, 0, 100, 80)], '#5ab8ff')]).id, 0, 4);
  return doc;
}

const json = (v: unknown) => JSON.stringify(v);

describe('Lottie keeps the look', () => {
  it('writes blend modes as bm', () => {
    const doc = base();
    const l = addVectorLayer(doc, 'Top');
    l.blend = 'multiply';
    hold(l, vectorDrawing(doc, [fill([rectPath(10, 10, 20, 20)], '#ff0000')]).id, 0, 4);
    const { data } = lottieExport(doc);
    expect(data.layers.some((x: { bm?: number; nm: string }) => x.bm === 1 && x.nm === 'Top')).toBe(true);
  });

  it('turns a mask layer into a track matte over everything under it', () => {
    const doc = base();
    const m = addVectorLayer(doc, 'Window');
    m.mask = 'hide';
    hold(m, vectorDrawing(doc, [fill([ellipsePath(50, 40, 20, 20)], '#000000')]).id, 0, 4);
    const { data } = lottieExport(doc);
    const top = data.layers.filter((x: { ty: number }) => x.ty === 0);
    // The matte sits right above the layer it cuts; 'hide' is an inverted alpha matte.
    expect(top[0].td).toBe(1);
    expect(top[1].tt).toBe(2);
    expect(top[1].ind).toBe(top[0].ind + 1);
  });

  it('keeps clipped layers inside their base with a matte made from it', () => {
    const doc = base();
    const c = addVectorLayer(doc, 'Shine');
    c.clipToBelow = true;
    hold(c, vectorDrawing(doc, [fill([rectPath(0, 0, 30, 80)], '#ffffff')]).id, 0, 4);
    const s = json(lottieExport(doc).data);
    expect(s).toContain('"tt":1');
    expect(s).toContain('"td":1');
  });

  it('writes Soften and Shadow as Lottie effects with matching strength', () => {
    const doc = base();
    doc.layers[0].effects = [fx('blur', { radius: 3 }), fx('shadow', { x: 0, y: 4, softness: 5, opacity: 0.5 })];
    const { data, notes } = lottieExport(doc);
    const ef = data.layers.find((x: { nm: string }) => x.nm === 'Back').ef;
    expect(ef[0].ty).toBe(29);
    expect(ef[0].ef[0].v.k).toBeCloseTo(10);
    expect(ef[1].ty).toBe(25);
    // Straight down is 180 degrees in Lottie, softness is four times ours (sigma = softness / 4 there, ours is the sigma).
    expect(ef[1].ef[2].v.k).toBe(180);
    expect(ef[1].ef[3].v.k).toBe(4);
    expect(ef[1].ef[4].v.k).toBe(20);
    expect(notes).toEqual([]);
  });

  it('says so when an effect has no Lottie version and there is nothing to bake with', () => {
    const doc = base();
    doc.layers[0].effects = [fx('glow')];
    expect(lottieExport(doc).notes.join(' ')).toMatch(/effects on "Back" were left out/);
  });

  it('recolours a tinted symbol copy in its own precomp', () => {
    const doc = base();
    const l = addVectorLayer(doc, 'Coins');
    const k = vectorDrawing(doc, [fill([ellipsePath(20, 20, 10, 10)], '#000000')]);
    makeSymbol(doc, k.id, [k.shapes[0].id], { x: 20, y: 20 }, 'Coin');
    const inst = k.shapes[0] as InstanceShape;
    k.shapes.push({ ...inst, id: uid('s'), tint: { color: '#ff0000', amount: 0.5 } });
    hold(l, k.id, 0, 4);
    const { data } = lottieExport(doc);
    const symbols = data.assets.filter((a: { id: string }) => a.id.startsWith('symbol_'));
    expect(symbols.length).toBe(2);
    const s = json(symbols[1]);
    expect(s).toContain('[0.5,0,0,1]');
  });

  it('writes particles as one small group per particle', () => {
    const doc = base();
    const l = addVectorLayer(doc, 'Pop');
    const d = vectorDrawing(doc, []);
    d.shapes = [{ ...newParticles(uid('s'), 'sparkle', { x: 50, y: 40 }), burst: 5 }];
    hold(l, d.id, 0, 4);
    const pop = lottieExport(doc).data.layers.find((x: { nm: string }) => x.nm === 'Pop');
    expect(pop.shapes.length).toBe(5);
    expect(pop.shapes[0].it.at(-1).ty).toBe('tr');
  });

  it('drops keys a straight line already passes through', () => {
    const t = [0, 1, 2, 3, 4, 5];
    const k = smoothTrack([0, 1, 2, 3, 10, 10].map((v) => [v, 0]), t, 0.01).k;
    expect(k.map((x: { t: number }) => x.t)).toEqual([0, 3, 4, 5]);
    expect(k[2].h).toBe(1);
    expect(smoothTrack([2, 2, 2], [0, 1, 2], 0.1)).toEqual({ a: 0, k: 2 });
  });
});

describe('SVG keeps the look', () => {
  it('writes blend modes, effects as filters and masks as <mask>', () => {
    const doc = base();
    doc.layers[0].effects = [fx('blur', { radius: 2 }), fx('glow', { strength: 1.5 }), fx('outline', { width: 2 })];
    const top = addVectorLayer(doc, 'Top');
    top.blend = 'screen';
    hold(top, vectorDrawing(doc, [fill([rectPath(10, 10, 20, 20)], '#ff0000')]).id, 0, 4);
    const m = addVectorLayer(doc, 'Window');
    m.mask = 'show';
    hold(m, vectorDrawing(doc, [fill([ellipsePath(50, 40, 20, 20)], '#000000')]).id, 0, 4);
    for (const svg of [frameToSvg(doc, 0), animatedSvg(doc)]) {
      expect(svg).toContain('mix-blend-mode:screen');
      expect(svg).toContain('<feGaussianBlur in="SourceGraphic" result="r0" stdDeviation="2"/>');
      expect(svg).toMatch(/<feColorMatrix in="r\d+" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 0.5 0"/);
      expect(svg).toMatch(/<mask id="mk\w+" maskUnits="userSpaceOnUse"/);
      expect(svg).toContain('isolation:isolate');
    }
  });

  it('animates effect settings that change with SMIL, once per frame', () => {
    const doc = base();
    doc.layers[0].effects = [{ ...fx('blur', { radius: 2 }), keys: [{ frame: 0, values: { radius: 0 } }, { frame: 3, values: { radius: 6 } }] }];
    const svg = animatedSvg(doc);
    expect(svg).toContain('<animate attributeName="stdDeviation" values="0;2;4;6" keyTimes="0;0.25;0.5;0.75" calcMode="discrete"');
  });

  it('washes tinted copies with a filter, and lists pixelate as left out', () => {
    const doc = base();
    doc.layers[0].effects = [fx('pixelate')];
    const l = addVectorLayer(doc, 'Coins');
    const k = vectorDrawing(doc, [fill([ellipsePath(20, 20, 10, 10)], '#000000')]);
    makeSymbol(doc, k.id, [k.shapes[0].id], { x: 20, y: 20 }, 'Coin');
    (k.shapes[0] as InstanceShape).tint = { color: '#00ff00', amount: 0.25 };
    hold(l, k.id, 0, 4);
    const { svg, notes } = animatedSvgExport(doc);
    expect(svg).toContain('filter="url(#tint-00ff00-250)"');
    expect(svg).toContain('<filter id="tint-00ff00-250"');
    expect(notes.join(' ')).toMatch(/Pixelate on "Back" was left out/);
  });

  it('draws soft puffs with a gradient that fades to nothing, one per colour', () => {
    const doc = base();
    const l = addVectorLayer(doc, 'Smoke');
    const d = vectorDrawing(doc, []);
    d.shapes = [{ ...newParticles(uid('s'), 'smoke', { x: 50, y: 40 }), prewarm: true }];
    hold(l, d.id, 0, 4);
    for (const svg of [frameToSvg(doc, 2), animatedSvg(doc)]) {
      expect(svg).toMatch(/<circle [^>]*fill="url\(#soft-[0-9a-f]+\)"/);
      expect(svg).toMatch(/<radialGradient id="soft-[0-9a-f]+"><stop offset="0" stop-color="#[0-9a-f]{6}"\/><stop offset="0.45"[^>]*stop-opacity="0.667"\/><stop offset="1"[^>]*stop-opacity="0"\/>/);
      const ids = svg.match(/<radialGradient id="(soft-[0-9a-f]+)"/g) ?? [];
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('draws symbol particles with the symbol, written once and placed with <use>', () => {
    const doc = base();
    const k = vectorDrawing(doc, [fill([ellipsePath(5, 5, 5, 5)], '#ff00ff')]);
    const made = makeSymbol(doc, k.id, [k.shapes[0].id], { x: 5, y: 5 }, 'Dot')!;
    const l = addVectorLayer(doc, 'Pop');
    const d = vectorDrawing(doc, []);
    d.shapes = [{ ...newParticles(uid('s'), 'sparkle', { x: 50, y: 40 }), burst: 4, sprite: 'symbol', symbolId: made.symbolId }];
    hold(l, d.id, 1, 2);
    const svg = frameToSvg(doc, 2);
    expect(svg.match(/<use href="#sprite0"/g)?.length).toBe(4);
    expect(svg.match(/<g id="sprite0">/g)?.length).toBe(1);
  });
});

describe('what carries over', () => {
  it('has a note for every format', () => {
    for (const f of allFormats()) expect(carryOf(f.id).summary.length).toBeGreaterThan(20);
  });

  it('lists what this document loses per format', () => {
    const doc = base();
    doc.layers[0].effects = [fx('glow'), fx('blur')];
    expect(carryWarnings(doc, 'lottie')).toEqual(['Turned into pictures here: layers with glow.']);
    expect(carryWarnings(doc, 'svganim')).toEqual([]);
    expect(carryWarnings(doc, 'mp4')).toEqual([]);
    doc.layers[0].effects = [fx('pixelate')];
    expect(carryWarnings(doc, 'svg')).toEqual(['Left out here: pixelate.']);
    doc.layers[0].mask = 'show';
    expect(docFeatures(doc).features.has('mask')).toBe(true);
    expect(carryWarnings(doc, 'pdf')[0]).toMatch(/masks/);
  });
});
