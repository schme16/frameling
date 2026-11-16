// Brush tips in the exports and the file: every vector format draws them as plain shapes, the Export window says what
// that costs, and a file with tips (or with a damaged one) opens.
import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Doc, FillShape, StrokeShape } from '../../src/core/format';
import { DEFAULT_BRUSH, newDoc, newVectorLayer } from '../../src/core/doc';
import { drawingBox, strokeOutline } from '../../src/core/render';
import { poseAt } from '../../src/core/symbols';
import { withTips } from '../../src/core/tips';
import { frameToSvg, shapeToSvg } from '../../src/export/svg';
import { writePdf } from '../../src/export/pdf';
import { docToLottie } from '../../src/export/lottie';
import { carryWarnings, docFeatures, GRAIN_NOTE } from '../../src/export/carries';
import { loadFile, saveFile } from '../../src/io/file';
import { defaultTip } from '../../src/geometry/tip';
import type { FormatId } from '../../src/export/types';

const wave = (n = 40) => Array.from({ length: n }, (_, i) => ({ x: 20 + i * 4, y: 50 + Math.sin(i / 5) * 18, p: 0.5 }));
const stroke = (id: string, tip?: StrokeShape['brush']['tip'], extra: Partial<StrokeShape['brush']> = {}): StrokeShape => ({ id, type: 'stroke', points: wave(), brush: { ...DEFAULT_BRUSH, size: 14, ...extra, ...(tip ? { tip } : {}) }, color: '#336699', opacity: 1 });

function docWith(...shapes: StrokeShape[]): Doc {
  const doc = newDoc({ width: 200, height: 100 });
  const l = Object.assign(newVectorLayer('A'), { id: 'a' });
  doc.drawings = { d: { id: 'd', kind: 'vector', shapes } };
  l.cels = [{ id: 'c', start: 0, length: 1, drawingId: 'd' }];
  doc.layers = [l];
  doc.length = 1;
  return doc;
}

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
const ALL_VECTOR: FormatId[] = ['svg', 'svganim', 'lottie', 'pdf', 'ai'];

describe('what the Export window says', () => {
  it('finds grain in a chalk or charcoal line, and nothing in plain, watercolour or stamps', () => {
    expect(docFeatures(docWith(stroke('a', defaultTip('chalk')))).features.has('grain')).toBe(true);
    expect(docFeatures(docWith(stroke('a', defaultTip('charcoal')))).features.has('grain')).toBe(true);
    for (const tip of [undefined, defaultTip('watercolour'), defaultTip('stamp')]) expect(docFeatures(docWith(stroke('a', tip))).features.has('grain')).toBe(false);
  });
  it('says it once for each vector format: still vector, but bigger', () => {
    const doc = docWith(stroke('a', defaultTip('chalk')));
    for (const f of ALL_VECTOR) {
      const w = carryWarnings(doc, f);
      expect(w, f).toContain(GRAIN_NOTE);
      expect(w.filter((x) => x === GRAIN_NOTE)).toHaveLength(1);
    }
    expect(GRAIN_NOTE).not.toContain('—');
    expect(GRAIN_NOTE).toMatch(/vector/);
    expect(GRAIN_NOTE).toMatch(/bigger/);
  });
  it('says nothing for pictures of frames, for Photoshop (everything is pixels there), or when there is no grain', () => {
    const doc = docWith(stroke('a', defaultTip('chalk')));
    for (const f of ['mp4', 'gif', 'apng', 'png', 'webp', 'pngseq', 'sheet', 'psd'] as FormatId[]) expect(carryWarnings(doc, f), f).not.toContain(GRAIN_NOTE);
    for (const tip of [undefined, defaultTip('watercolour'), defaultTip('stamp')]) for (const f of ALL_VECTOR) expect(carryWarnings(docWith(stroke('a', tip)), f)).not.toContain(GRAIN_NOTE);
  });
});

describe('drawn as plain shapes', () => {
  it('poseAt leaves a drawing with no tips as the same object, and swaps tipped lines for their shapes (once)', () => {
    const plain = docWith(stroke('a'));
    expect(poseAt(plain, plain.layers[0], 0)).toBe(plain.drawings.d);
    const doc = docWith(stroke('a', defaultTip('chalk')), stroke('b'));
    const d = poseAt(doc, doc.layers[0], 0)!;
    expect(d).not.toBe(doc.drawings.d);
    expect(d.kind === 'vector' && d.shapes.map((s) => s.type)).toEqual(['fill', 'stroke']);
    expect(poseAt(doc, doc.layers[0], 0)).toBe(d);
    // The stored drawing is untouched: the line is still a line with its points and its tip.
    const kept = doc.drawings.d.kind === 'vector' ? doc.drawings.d.shapes[0] : null;
    expect(kept).toMatchObject({ type: 'stroke', brush: { tip: { kind: 'chalk' } } });
    expect(withTips({ id: 'p', kind: 'pixel', width: 1, height: 1, pixels: new Uint8ClampedArray(4) })).toMatchObject({ kind: 'pixel' });
  });
  it('SVG: chalk is one path with the grain as holes, a stamp line is a path per stamp, watercolour has an edge line', () => {
    const chalk = frameToSvg(docWith(stroke('a', defaultTip('chalk'))), 0);
    expect(count(chalk, /<path /g)).toBe(1);
    expect(count(chalk, /M/g)).toBeGreaterThan(30);
    expect(chalk).toContain('fill-rule="evenodd"');
    const stamps = frameToSvg(docWith(stroke('a', { kind: 'stamp', shape: 'star', spacing: 1.5 })), 0);
    expect(count(stamps, /<path /g)).toBeGreaterThan(8);
    const wc = frameToSvg(docWith(stroke('a', defaultTip('watercolour'), { size: 24 })), 0);
    expect(count(wc, /<path /g)).toBe(3);
    expect(wc).toMatch(/stroke="#336699"/);
    expect(wc).toMatch(/stroke-width=/);
  });
  it('SVG of one shape on its own writes the same shapes the frame does', () => {
    const s = stroke('a', defaultTip('chalk'));
    expect(shapeToSvg(s)).toBe(frameToSvg(docWith(s), 0).match(/<path .*\/>/)![0]);
  });
  it('a line without a tip is written as before', () => {
    const svg = frameToSvg(docWith(stroke('a')), 0);
    expect(count(svg, /<path /g)).toBe(1);
    expect(count(svg, /M/g)).toBe(1);
  });
  it('PDF and Lottie take tipped lines and write more shapes than a plain one', () => {
    const plain = docWith(stroke('a'));
    const chalk = docWith(stroke('a', defaultTip('chalk')));
    const pdf = (d: Doc) => Buffer.from(writePdf(d, { frames: [0], scale: 1, background: null, title: 't' })).toString('latin1');
    expect(pdf(chalk).length).toBeGreaterThan(pdf(plain).length);
    const lot = (d: Doc) => JSON.stringify(docToLottie(d, {}));
    const a = lot(chalk);
    expect(a.length).toBeGreaterThan(lot(plain).length * 3);
    expect(() => JSON.parse(a)).not.toThrow();
  });
  it('the box of a drawing takes in stamps that wander past the outline', () => {
    const near = stroke('a', { kind: 'stamp', scatter: 0 });
    const far = stroke('a', { kind: 'stamp', scatter: 2 });
    const bx = (s: StrokeShape) => drawingBox({ id: 'd', kind: 'vector', shapes: [s] });
    expect(bx(far).y1 - bx(far).y0).toBeGreaterThan(bx(near).y1 - bx(near).y0);
    const o = strokeOutline(near);
    expect(bx(near).y0).toBeLessThanOrEqual(Math.min(...o.map((p) => p[1])));
  });
});

describe('brushes you build yourself leave as plain vector shapes', () => {
  const ribbon = defaultTip('along');
  const link = defaultTip('edged');
  const mine = { nib: defaultTip('nib'), bristle: { ...defaultTip('bristle'), seed: 4 }, along: ribbon, edged: link };
  for (const [name, tip] of Object.entries(mine)) {
    it(`${name}: SVG, PDF, Lottie and Illustrator write them with nothing to flatten, and the file keeps the tip`, () => {
      const doc = docWith(stroke('a', tip, { size: 16 }));
      const svg = frameToSvg(doc, 0);
      expect(count(svg, /<path /g)).toBeGreaterThanOrEqual(1);
      expect(svg).not.toMatch(/<image|data:image/);
      const pdf = Buffer.from(writePdf(doc, { frames: [0], scale: 1, background: null, title: 't' })).toString('latin1');
      expect(pdf.startsWith('%PDF')).toBe(true);
      expect(pdf).not.toContain('/Subtype /Image');
      expect(() => JSON.parse(JSON.stringify(docToLottie(doc, {})))).not.toThrow();
      for (const f of ALL_VECTOR) expect(carryWarnings(doc, f), f).not.toContain(GRAIN_NOTE);
      // The stored line is untouched, and a saved file brings the same tip back.
      const bytes = saveFile(doc, 't');
      const back = loadFile(bytes).doc.drawings.d;
      expect(back.kind === 'vector' && (back.shapes[0] as StrokeShape).brush.tip).toEqual(tip);
    });
  }
  it('the poses a drawing is exported from hold only fills and paths, never a brush line with a tip', () => {
    const doc = docWith(...Object.values(mine).map((t, i) => stroke(`s${i}`, t)));
    const d = poseAt(doc, doc.layers[0], 0)!;
    expect(d.kind === 'vector' && d.shapes.every((x) => x.type === 'fill' || x.type === 'path')).toBe(true);
  });
});

describe('the file', () => {
  const reopen = (doc: Doc, edit?: (raw: any) => void) => {
    const bytes = saveFile(doc, 't');
    if (!edit) return loadFile(bytes).doc;
    const files = unzipSync(bytes);
    const raw = JSON.parse(strFromU8(files['doc.json']));
    edit(raw);
    files['doc.json'] = strToU8(JSON.stringify(raw));
    return loadFile(zipSync(files)).doc;
  };
  const first = (d: Doc) => (d.drawings.d.kind === 'vector' ? (d.drawings.d.shapes[0] as StrokeShape) : null);
  it('keeps a line with a tip, custom stamp and all', () => {
    const tip = { kind: 'stamp' as const, shape: 'custom' as const, custom: [[-0.5, -0.5, 0.5, -0.5, 0, 0.5]], angle: 'upright' as const, spacing: 1.4, seed: 77 };
    const back = reopen(docWith(stroke('a', tip), stroke('b', defaultTip('watercolour'))));
    expect(first(back)?.brush.tip).toEqual(tip);
    expect((back.drawings.d.kind === 'vector' && (back.drawings.d.shapes[1] as StrokeShape).brush.tip) || null).toEqual(defaultTip('watercolour'));
  });
  it('opens a file from before tips: no tip, and nothing added to the brush', () => {
    const back = reopen(docWith(stroke('a')));
    expect('tip' in first(back)!.brush).toBe(false);
  });
  it('turns a damaged tip into a plain line and keeps the rest of the brush', () => {
    for (const bad of ['chalky', 12, { kind: 'neon' }, [], { amount: 1 }]) {
      const back = reopen(docWith(stroke('a', defaultTip('chalk'), { size: 31 })), (raw) => {
        raw.drawings.d.shapes[0].brush.tip = bad;
      });
      expect(first(back)?.brush.size).toBe(31);
      expect('tip' in first(back)!.brush).toBe(false);
    }
  });
  it('holds a tip to its limits on the way in', () => {
    const back = reopen(docWith(stroke('a', defaultTip('chalk'))), (raw) => {
      raw.drawings.d.shapes[0].brush.tip = { kind: 'chalk', amount: 50, grain: 'x', junk: true };
    });
    expect(first(back)?.brush.tip).toEqual({ kind: 'chalk', amount: 1 });
  });
  it('a filled shape made from a tipped line (the stored shape) is exactly what the drawing shows', () => {
    const doc = docWith(stroke('a', defaultTip('chalk')));
    const shown = poseAt(doc, doc.layers[0], 0);
    const f = shown?.kind === 'vector' ? (shown.shapes[0] as FillShape) : null;
    expect(f?.type).toBe('fill');
    expect(f?.paths.length).toBeGreaterThan(1);
  });
});
