// Masks in every exporter that writes them as structure: a mask that is right on the canvas and wrong in a file is
// worse than none. Each one is checked with the mask on, the mask off (the eye), a hide mask, and a pixel layer under
// and as a mask. The ones that paint through the single renderer (PNG, GIF, APNG, sheets, video) are checked in a
// real canvas by scripts/e2e/masks.cjs.
import { describe, expect, it } from 'vitest';
import type { Doc, Layer } from '../../src/core/format';
import { newDoc, newPixelDrawing, uid } from '../../src/core/doc';
import { lottieExport } from '../../src/export/lottie';
import { animatedSvg } from '../../src/export/svg-anim';
import { frameToSvg } from '../../src/export/svg';
import { docFeatures, carryWarnings } from '../../src/export/carries';
import { layeredPlan, itemLayers, type LayeredItem } from '../../src/export/layered';
import { psdRecords } from '../../src/export/psd-layers';
import { addPixelLayer, addVectorLayer, ellipsePath, fill, hold, rectPath, vectorDrawing } from '../../src/templates/build';
import * as edit from '../../src/effects/edit';

function vectorDoc(mode: 'show' | 'hide' | null, on = true): Doc {
  const doc = newDoc({ width: 100, height: 80, length: 4, fps: 12 });
  doc.layers = [];
  const back = addVectorLayer(doc, 'Back');
  hold(back, vectorDrawing(doc, [fill([rectPath(0, 0, 100, 80)], '#5ab8ff')]).id, 0, 4);
  const art = addVectorLayer(doc, 'Art');
  hold(art, vectorDrawing(doc, [fill([rectPath(10, 10, 60, 40)], '#ff6f91')]).id, 0, 4);
  if (mode) {
    const m = addVectorLayer(doc, 'Window');
    m.mask = mode;
    m.visible = on;
    hold(m, vectorDrawing(doc, [fill([ellipsePath(50, 40, 20, 20)], '#000000')]).id, 0, 4);
    edit.makeFolder(doc, doc.layers.map((l) => l.id), 'Masked');
  }
  return doc;
}

function pixelDoc(maskOnPixels: boolean, on = true): Doc {
  const doc = newDoc({ width: 64, height: 64, length: 2, fps: 12 });
  doc.layers = [];
  const art = addPixelLayer(doc, 'Sprite', 8);
  const d = newPixelDrawing(8, 8);
  d.pixels.fill(255);
  d.id = uid('p');
  doc.drawings[d.id] = d;
  hold(art, d.id, 0, 2);
  const m = maskOnPixels ? addPixelLayer(doc, 'Pixel mask', 8) : addVectorLayer(doc, 'Window');
  m.mask = 'show';
  m.visible = on;
  if (maskOnPixels) {
    const md = newPixelDrawing(8, 8);
    for (let i = 0; i < 8 * 4; i++) md.pixels.set([0, 0, 0, 255], i * 4);
    md.id = uid('p');
    doc.drawings[md.id] = md;
    hold(m, md.id, 0, 2);
  } else hold(m, vectorDrawing(doc, [fill([ellipsePath(32, 32, 16, 16)], '#000000')]).id, 0, 2);
  edit.makeFolder(doc, [art.id, m.id], 'Masked');
  return doc;
}

const svgs = (doc: Doc) => [frameToSvg(doc, 0), animatedSvg(doc)];
const lottie = (doc: Doc) => JSON.stringify(lottieExport(doc).data);
const masked = (items: LayeredItem[]): LayeredItem[] => items.flatMap((i) => (i.kind === 'masked' ? [i, ...masked(i.layers)] : i.kind === 'group' ? masked(i.layers) : []));

describe('a vector mask on', () => {
  for (const mode of ['show', 'hide'] as const) {
    it(`SVG and Lottie write a ${mode} mask`, () => {
      const doc = vectorDoc(mode);
      for (const svg of svgs(doc)) expect(svg).toMatch(/<mask id="mk\w+"/);
      const l = lottie(doc);
      expect(l).toContain('"td":1');
      expect(l).toContain(mode === 'hide' ? '"tt":2' : '"tt":1');
    });
  }

  it('PSD and PDF lay it out as a group with a mask, and warn where a format cannot carry it', () => {
    const doc = vectorDoc('show');
    const plan = layeredPlan(doc, 0);
    const g = plan.find((i) => i.kind === 'group');
    expect(g && g.kind === 'group' && g.masks.map((l) => l.name)).toEqual(['Window']);
    expect(docFeatures(doc).features.has('mask')).toBe(true);
    expect(carryWarnings(doc, 'pdf')[0]).toMatch(/masks/);
  });
});

describe('a mask that is off', () => {
  it('SVG and Lottie leave it out, as if it was never there', () => {
    const doc = vectorDoc('show', false);
    for (const svg of svgs(doc)) expect(svg).not.toMatch(/<mask /);
    const l = lottie(doc);
    expect(l).not.toContain('"td":1');
    expect(l).not.toContain('"tt":1');
    // The layers under it are drawn exactly as they are with no mask at all.
    const none = vectorDoc(null);
    expect(frameToSvg(doc, 0).replace(/id="[^"]*"|url\(#[^)]*\)|href="#[^"]*"/g, '')).toContain('#ff6f91');
    expect(frameToSvg(none, 0)).toContain('#ff6f91');
    expect(frameToSvg(doc, 0)).not.toContain('<ellipse');
  });

  it('PSD keeps it as a hidden layer and cuts nothing', () => {
    const doc = vectorDoc('show', false);
    const plan = layeredPlan(doc, 0);
    expect(masked(plan)).toEqual([]);
    const m = itemLayers(plan).find((x) => x.layer.name === 'Window')!;
    expect(m.hidden).toBe(true);
    const recs = psdRecords(plan, { layer: () => ({ width: 1, height: 1, data: new Uint8Array(4) }), folder: () => ({ width: 1, height: 1, data: new Uint8Array(4) }) } as never);
    expect(recs.some((r) => 'mask' in r && r.mask)).toBe(false);
  });

  it('does not make the file warn about masks it does not use', () => {
    const doc = vectorDoc('show', false);
    expect(docFeatures(doc).features.has('mask')).toBe(false);
    expect(carryWarnings(doc, 'pdf').join(' ')).not.toMatch(/masks/);
  });
});

describe('pixel layers', () => {
  it('a vector mask over a pixel layer is written as a mask in SVG and Lottie', () => {
    const doc = pixelDoc(false);
    for (const svg of svgs(doc)) expect(svg).toMatch(/<mask id="mk\w+"/);
    expect(lottie(doc)).toContain('"td":1');
  });

  it('a pixel layer as the mask is written as a mask too', () => {
    const doc = pixelDoc(true);
    for (const svg of svgs(doc)) expect(svg).toMatch(/<mask id="mk\w+"/);
    expect(lottie(doc)).toContain('"td":1');
    const plan = layeredPlan(doc, 0);
    const g = plan.find((i) => i.kind === 'group');
    expect(g && g.kind === 'group' && g.masks.map((l) => l.kind)).toEqual(['pixel']);
  });

  it('a pixel mask that is off writes none', () => {
    const doc = pixelDoc(true, false);
    for (const svg of svgs(doc)) expect(svg).not.toMatch(/<mask /);
    expect(lottie(doc)).not.toContain('"td":1');
  });
});

describe('a mask is not drawn as a layer', () => {
  it('its own drawing never shows in SVG, on or off', () => {
    for (const on of [true, false]) {
      const doc = vectorDoc('show', on);
      // The mask's black is only ever inside <defs>, as the matte; nothing of it is drawn on the page.
      expect(frameToSvg(doc, 0).replace(/<defs>[\s\S]*<\/defs>/, '')).not.toContain('#000000');
    }
  });
});
