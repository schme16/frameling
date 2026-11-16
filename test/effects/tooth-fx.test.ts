// Vector chalk and charcoal that catch on paper: the brush tips that carry it, the Paper tooth effect on the line, how the line is
// drawn and kept, and what every export does with one. The maths is in test/dry/tooth.test.ts.
import { describe, expect, it } from 'vitest';
import { STARTERS } from '../../src/brushes/starters';
import type { BrushSettings, Doc, LayerEffect, StrokeShape } from '../../src/core/format';
import { DEFAULT_BRUSH, newDoc } from '../../src/core/doc';
import '../../src/core/render';
import { onPaper, withTips } from '../../src/core/tips';
import { defaultTip, isDry, isGrainy, readTip, sameTip } from '../../src/geometry/tip';
import { loadFile, saveFile } from '../../src/io/file';
import { resetDry, setPaper } from '../../src/dry/settings';
import { toothValues } from '../../src/dry/tooth';
import { EFFECTS, defaultValues, effectInfo } from '../../src/effects/model';
import { hasShapeFx, layerShapeFxKinds } from '../../src/effects/shapeFx';
import { toothPicture } from '../../src/effects/toothShape';
import { bakesEffects, carryWarnings, docFeatures, GRAIN_NOTE, TOOTH_NOTE } from '../../src/export/carries';
import { needsPicture } from '../../src/export/layered';
import { lottieExport } from '../../src/export/lottie';
import { frameSvgExport } from '../../src/export/svg';
import { addVectorLayer, hold, vectorDrawing } from '../../src/templates/build';
import { buildStroke, toothEffects } from '../../src/tools/vectorStroke';

const pts = Array.from({ length: 30 }, (_, i) => ({ x: 20 + i * 8, y: 60 + Math.sin(i / 4) * 12, p: 0.5 }));
const starter = (id: string): BrushSettings => STARTERS.find((s) => s.id === `starter:${id}`)!.brush;
const tooth = (): LayerEffect => ({ id: 'e1', kind: 'tooth', values: { ...defaultValues('tooth') } });

/** A page with one drawing layer holding the shapes. */
function page(shapes: StrokeShape[]): Doc {
  const doc = newDoc({ width: 300, height: 120, length: 4, fps: 12 });
  doc.layers = [];
  const l = addVectorLayer(doc, 'Sketch');
  hold(l, vectorDrawing(doc, shapes).id, 0, 4);
  return doc;
}

describe('the Paper tooth effect', () => {
  it('is in the catalogue, in plain words, with every setting a range and a default the maths can use', () => {
    const e = effectInfo('tooth');
    expect(EFFECTS.map((x) => x.kind)).toContain('tooth');
    expect(e.label).toBe('Paper tooth');
    expect(e.description).not.toMatch(/—/);
    for (const p of e.params) {
      expect(p.min).toBeDefined();
      expect(p.max).toBeDefined();
      expect(p.default as number).toBeGreaterThanOrEqual(p.min!);
      expect(p.default as number).toBeLessThanOrEqual(p.max!);
    }
    expect(Object.keys(defaultValues('tooth')).sort()).toEqual(Object.keys(toothValues('chalk')).sort());
  });

  it('counts as an effect on a shape, so merging, effects lists and exports all know about it', () => {
    const s: StrokeShape = { ...buildStroke(pts, DEFAULT_BRUSH, '#111111'), effects: [tooth()] };
    expect(hasShapeFx(s)).toBe(true);
    expect(onPaper(s)).toBe(true);
    expect(onPaper({ ...s, effects: [{ ...tooth(), on: false }] })).toBe(false);
  });
});

describe('the brushes that catch on paper', () => {
  it('chalk and charcoal start on a dry medium, with the usual grain size', () => {
    expect(defaultTip('chalk')).toMatchObject({ kind: 'chalk', dry: 'chalk', grain: 1 });
    expect(defaultTip('charcoal')).toMatchObject({ kind: 'charcoal', dry: 'compressed-charcoal', grain: 1 });
    expect(defaultTip('watercolour').dry).toBeUndefined();
  });

  it('every chalk, charcoal, pastel, crayon and pencil starter is on its own medium; oil and bristle are bristles, and the dry brush is crayon paper', () => {
    const med: Record<string, string> = {
      chalk: 'chalk',
      charcoal: 'compressed-charcoal',
      'soft-pastel': 'soft-pastel',
      'oil-pastel': 'oil-pastel',
      crayon: 'crayon',
      'vine-charcoal': 'vine-charcoal',
      'compressed-charcoal': 'compressed-charcoal',
      'soft-pencil': 'soft-pencil',
      'colour-pencil': 'colour-pencil',
      'sketch-pencil': 'sketch-pencil',
    };
    for (const [id, m] of Object.entries(med)) expect(starter(id).tip?.dry, id).toBe(m);
    for (const id of ['oil', 'bristle']) expect(starter(id).tip?.dry, id).toBeUndefined();
    expect(starter('dry-brush').tip?.dry).toBe('crayon');
    expect(isDry(starter('vine-charcoal'))).toBe(true);
    expect(isDry(starter('oil'))).toBe(false);
    expect(isGrainy(starter('oil'))).toBe(false);
    expect(isGrainy({ ...starter('oil'), tip: { kind: 'chalk', amount: 0.18, grain: 0.6 } })).toBe(true);
  });

  it('its effect is on the sheet\'s paper, not always the medium one', () => {
    expect(toothValues('chalk', 1, 0, undefined, 'rough').paper).toBe(4);
    expect(toothValues('chalk').paper).toBe(2);
    setPaper('smooth');
    expect(buildStroke(pts, starter('vine-charcoal'), '#111111', 1, false, 42).effects![0].values.paper).toBe(0);
    resetDry();
  });

  it('a line drawn with one carries a Paper tooth effect set for its medium, and one seed for the whole line', () => {
    const a = buildStroke(pts, starter('vine-charcoal'), '#111111', 1, false, 42);
    expect(a.effects).toHaveLength(1);
    expect(a.effects![0].kind).toBe('tooth');
    expect(a.effects![0].values).toEqual(toothValues('vine-charcoal', 1, 42));
    expect(toothEffects(starter('chalk'), 5)![0].values.seed).toBe(5);
    // Plain lines and the tiny-shape tips carry nothing.
    expect(buildStroke(pts, DEFAULT_BRUSH, '#111').effects).toBeUndefined();
    expect(buildStroke(pts, starter('oil'), '#111').effects).toBeUndefined();
    expect(buildStroke(pts, { ...starter('chalk'), tip: { ...starter('chalk').tip!, dry: undefined } }, '#111').effects).toBeUndefined();
  });

  it('keep the medium when saved and shared, ignore one that is not a medium, and count as a different tip', () => {
    const t = defaultTip('charcoal');
    expect(readTip(JSON.parse(JSON.stringify(t)))).toEqual(t);
    expect(readTip({ kind: 'charcoal', dry: 'nonsense' })).toEqual({ kind: 'charcoal' });
    expect(readTip({ kind: 'watercolour', dry: 'chalk' })).toEqual({ kind: 'watercolour' });
    expect(sameTip(t, { ...t, dry: undefined })).toBe(false);
    expect(sameTip(t, { ...t, dry: 'vine-charcoal' })).toBe(false);
    expect(sameTip(t, { ...t })).toBe(true);
  });
});

describe('the line in the file', () => {
  it('writes and reads back the same, and a file from before opens as it was', () => {
    const on = buildStroke(pts, starter('compressed-charcoal'), '#111111', 1, false, 9);
    const old = buildStroke(pts, { ...starter('compressed-charcoal'), tip: { kind: 'charcoal', amount: 0.35, grain: 0.8 } }, '#111111');
    expect(old.effects).toBeUndefined();
    const doc = page([on, old]);
    const back = loadFile(saveFile(doc, '1.0.0')).doc;
    expect(back).toEqual(doc);
    const shapes = Object.values(back.drawings).flatMap((d) => (d.kind === 'vector' ? d.shapes : [])) as StrokeShape[];
    expect(shapes[0].effects?.[0].kind).toBe('tooth');
    expect(shapes[1].effects).toBeUndefined();
    expect(shapes[1].brush.tip).toEqual({ kind: 'charcoal', amount: 0.35, grain: 0.8 });
  });

  it('stays a line (its points) when a drawing is shown, and a line without it still becomes tiny shapes', () => {
    const on = buildStroke(pts, starter('chalk'), '#111111', 1, false, 1);
    const off = buildStroke(pts, { ...starter('chalk'), tip: { ...starter('chalk').tip!, dry: undefined } }, '#111111');
    const doc = page([on, off]);
    const d = Object.values(doc.drawings)[0];
    const shown = withTips(d);
    if (shown.kind !== 'vector') throw new Error('vector');
    expect(shown.shapes.includes(on)).toBe(true);
    expect(shown.shapes.filter((s) => s.type === 'stroke')).toEqual([on]);
    expect(shown.shapes.map((x) => x.type)).toEqual(['stroke', 'fill']);
    // Switch it off in the Effects panel and the tiny shapes draw it again.
    const sw = { ...on, effects: [{ ...on.effects![0], on: false }] };
    expect(withTips({ ...d, shapes: [sw] } as typeof d)).not.toBe(d);
    const swShown = withTips({ ...d, shapes: [sw] } as typeof d);
    if (swShown.kind === 'vector') expect(swShown.shapes.some((s) => s.type === 'stroke')).toBe(false);
  });
});

describe('drawing it', () => {
  const s = buildStroke(pts, starter('compressed-charcoal'), '#112233', 0.8, false, 3);
  const values = s.effects![0].values;

  it('makes a picture of pigment as small as the line, in the line colour and opacity', () => {
    const pic = toothPicture(s, values, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })!;
    expect(pic.w).toBeLessThan(260);
    expect(pic.h).toBeLessThan(60);
    let n = 0;
    for (let i = 0; i < pic.data.length; i += 4)
      if (pic.data[i + 3]) {
        n++;
        expect([pic.data[i], pic.data[i + 1], pic.data[i + 2]]).toEqual([0x11, 0x22, 0x33]);
        expect(pic.data[i + 3]).toBeLessThanOrEqual(Math.round(0.8 * 255));
      }
    expect(n).toBeGreaterThan(200);
  });

  it('is bigger on a bigger view, in step with it, and the paper moves with the page', () => {
    const one = toothPicture(s, values, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })!;
    const two = toothPicture(s, values, { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 })!;
    expect(two.w).toBeGreaterThan(one.w * 1.8);
    const shifted = toothPicture(s, values, { a: 1, b: 0, c: 0, d: 1, e: 40, f: 10 })!;
    expect(shifted.x).toBe(one.x + 40);
    expect(Buffer.from(shifted.data).equals(Buffer.from(one.data))).toBe(true);
  });

  it('shows nothing for a line trimmed away, and only the part that shows for one trimmed part way', () => {
    const none = toothPicture({ ...s, trim: { start: 0, end: 0, offset: 0 } }, values, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    expect(none).toBeNull();
    const full = toothPicture(s, values, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })!;
    const half = toothPicture({ ...s, trim: { start: 0, end: 50, offset: 0 } }, values, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })!;
    expect(half.w).toBeLessThan(full.w * 0.7);
  });
});

describe('what each export does with one', () => {
  const dry = buildStroke(pts, starter('compressed-charcoal'), '#112233', 1, false, 3);
  const doc = page([dry]);

  it('knows the document has paper tooth on a line, and counts it as one effect on a shape and not as the older tiny-shape grain', () => {
    const f = docFeatures(doc);
    expect(f.tooth).toBe(true);
    expect(f.features.has('grain')).toBe(false);
    expect([...f.shapeEffectKinds]).toEqual(['tooth']);
    expect([...layerShapeFxKinds(doc, doc.layers[0])]).toEqual(['tooth']);
    // The older grain is still counted as grain.
    const old = page([buildStroke(pts, { ...starter('oil'), tip: { kind: 'chalk', amount: 0.18, grain: 0.6 } }, '#111')]);
    expect(docFeatures(old).features.has('grain')).toBe(true);
    expect(docFeatures(old).tooth).toBe(false);
  });

  it('pictures of frames (PNG, GIF, video, APNG, WebP, PNG sequence, sprite sheet) draw it exactly, so there is nothing to say', () => {
    for (const f of ['png', 'jpeg', 'gif', 'apng', 'mp4', 'webm', 'webp', 'sheet', 'pngseq', 'prores'] as const) expect(carryWarnings(doc, f), f).toEqual([]);
  });

  it('PDF, Illustrator, Photoshop and Lottie turn the layer into a picture, which is drawn by the app, so it looks right', () => {
    for (const f of ['pdf', 'ai', 'psd', 'lottie'] as const) {
      expect(bakesEffects(doc, f), f).toBe(true);
      expect(carryWarnings(doc, f).join(' '), f).toMatch(/Turned into pictures here: .*layers with a shape that has paper tooth/);
    }
    expect(needsPicture(doc.layers[0], 0, doc)).toBe(true);
    const { data, notes } = lottieExport(doc);
    expect(JSON.stringify(data)).not.toContain('"ty":29');
    expect(notes.join(' ')).toMatch(/Sketch/);
  });

  it('SVG keeps it as shapes: sharp at any size, but the paper texture is the older tiny-shape grain, and it says so', () => {
    const { svg, notes } = frameSvgExport(doc, 0);
    expect(svg).toContain('<path');
    expect(svg).not.toContain('<image');
    // Written as the line's tiny shapes (one big path with the grain as holes), not as one smooth stroke.
    const d = svg.match(/ d="([^"]+)"/)![1];
    expect((d.match(/M/g) ?? []).length).toBeGreaterThan(20);
    expect(notes.join(' ')).toMatch(/Paper tooth on a shape was left out/i);
    const w = carryWarnings(doc, 'svg');
    expect(w).toContain(TOOTH_NOTE);
    expect(w).not.toContain(GRAIN_NOTE);
    expect(w.join(' ')).not.toMatch(/Left out here: paper tooth/);
    expect(carryWarnings(doc, 'svganim')).toContain(TOOTH_NOTE);
    expect(TOOTH_NOTE).not.toMatch(/—/);
  });
});

describe('tweening', () => {
  it('keeps the line on paper through the in-betweens', async () => {
    const { morphShapes } = await import('../../src/core/shape-tween');
    const a = buildStroke(pts, starter('chalk'), '#111111', 1, false, 4);
    const b = { ...buildStroke(pts.map((p) => ({ ...p, y: p.y + 20 })), starter('chalk'), '#111111', 1, false, 4), origin: a.id };
    const mid = morphShapes({ id: 'a', kind: 'vector', shapes: [a] }, { id: 'b', kind: 'vector', shapes: [b] }, 0.5, [], (x) => x) as StrokeShape[];
    expect(mid[0].type).toBe('stroke');
    expect(mid[0].effects).toEqual(a.effects);
    expect(onPaper(mid[0])).toBe(true);
  });
});
