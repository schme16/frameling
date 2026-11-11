import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unzlibSync } from 'fflate';
import type { Doc, Layer, PathShape } from '../../src/core/format';
import { newDoc, newPixelLayer, newVectorLayer } from '../../src/core/doc';
import { pdfBlend, pdfString, writePdf } from '../../src/export/pdf';
import { flatPlan, layeredPlan } from '../../src/export/layered';

const rect = (id: string, x: number, y: number, w: number, h: number, fill: string, opacity = 1): PathShape => ({
  id,
  type: 'path',
  paths: [{ closed: true, points: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] }],
  fill,
  stroke: null,
  opacity,
});

function sample(): Doc {
  const doc = newDoc({ width: 40, height: 20, background: '#ffffff' });
  const a = Object.assign(newVectorLayer('Red box'), { id: 'a' });
  const b = Object.assign(newVectorLayer('Blue (half)'), { id: 'b', opacity: 0.5, blend: 'multiply' as const });
  doc.drawings = {
    da: { id: 'da', kind: 'vector', shapes: [rect('r', 0, 0, 20, 20, '#ff0000')] },
    db: { id: 'db', kind: 'vector', shapes: [rect('q', 20, 0, 20, 20, '#0000ff')] },
  };
  a.cels = [{ id: 'c1', start: 0, length: 2, drawingId: 'da' }];
  b.cels = [{ id: 'c2', start: 0, length: 2, drawingId: 'db' }];
  doc.layers = [a, b];
  doc.length = 2;
  return doc;
}

const have = (t: string) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [t]).status === 0;

/** The PDF's objects, with streams inflated, as text (good enough to look for operators). */
function inflate(bytes: Uint8Array): string {
  const s = Buffer.from(bytes).toString('latin1');
  let out = '';
  const re = /stream\n([\s\S]*?)\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    try {
      out += Buffer.from(unzlibSync(Buffer.from(m[1], 'latin1'))).toString('latin1') + '\n';
    } catch {
      // Not every stream is compressed text.
    }
  }
  return s + '\n' + out;
}

describe('PDF export', () => {
  it('writes strings and blend names PDF understands', () => {
    expect(pdfString('A (b)')).toBe('(A \\(b\\))');
    expect(pdfString('é')).toBe('<FEFF00E9>');
    expect(pdfBlend('multiply')).toBe('Multiply');
    expect(pdfBlend('add')).toBe('Screen');
  });

  it('has a valid cross-reference table, a page per frame and a PDF layer per Frameling layer', () => {
    const bytes = writePdf(sample(), { frames: [0, 1], scale: 1, background: '#ffffff', title: 'Test' });
    const s = Buffer.from(bytes).toString('latin1');
    expect(s.startsWith('%PDF-1.7')).toBe(true);
    const start = Number(/startxref\n(\d+)/.exec(s)![1]);
    expect(s.slice(start, start + 4)).toBe('xref');
    // Every offset in the table points at its object.
    const rows = s.slice(start).split('\n').slice(3);
    rows.forEach((r, i) => {
      if (!/ n $/.test(r)) return;
      const off = Number(r.slice(0, 10));
      expect(s.slice(off, off + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`));
    });
    expect((s.match(/\/Type \/Page /g) ?? []).length).toBe(2);
    expect(s).toContain('/Name (Red box)');
    expect(s).toContain('/Name (Blue \\(half\\))');
    const all = inflate(bytes);
    expect(all).toContain('/BM /Multiply');
    expect(all).toContain('/ca 0.5');
    expect(all).toMatch(/1 0 0 rg/);
  });

  it('renders the way the canvas does (when Poppler is installed)', () => {
    if (!have('pdftoppm')) return;
    const dir = mkdtempSync(join(tmpdir(), 'frameling-pdf-'));
    writeFileSync(join(dir, 'a.pdf'), writePdf(sample(), { frames: [0], scale: 1, background: '#ffffff', title: 'T' }));
    const r = spawnSync('pdftoppm', ['-r', '72', '-png', '-singlefile', join(dir, 'a.pdf'), join(dir, 'a')]);
    expect(r.status).toBe(0);
    const png = readFileSync(join(dir, 'a.png'));
    expect(png.length).toBeGreaterThan(50);
    if (!have('convert')) return;
    const px = (x: number, y: number) => spawnSync('convert', [join(dir, 'a.png'), '-format', `%[pixel:p{${x},${y}}]`, 'info:'], { encoding: 'utf8' }).stdout;
    expect(px(10, 10)).toMatch(/srgb\(255,0,0\)|red/);
    // Blue at half strength, multiplied onto white: a light blue.
    expect(px(30, 10)).toMatch(/srgb\(12[6-9],12[6-9],255\)/);
  });

  it('keeps vector layers vector and flattens what PDF cannot draw', () => {
    const doc = sample();
    const px = Object.assign(newPixelLayer('Pixels', 4), { id: 'p' });
    const clipped: Layer = Object.assign(newVectorLayer('Shine'), { id: 's', clipToBelow: true });
    const glow: Layer = Object.assign(newVectorLayer('Glow'), { id: 'g', effects: [{ id: 'e', kind: 'glow' as const, values: {} }] });
    doc.layers = [...doc.layers, clipped, px, glow];
    const plan = flatPlan(doc);
    expect(plan.map((u) => (u.kind === 'vector' ? u.layer.id : u.kind === 'picture' ? `[${u.layers.map((l) => l.id).join(',')}]` : 'folder'))).toEqual(['a', '[b,s]', '[p]', '[g]']);
  });

  it('lays out PSD groups, clipping and masks from folders', () => {
    const doc = sample();
    doc.folders = { f: { id: 'f', name: 'Head', visible: true, opacity: 1 } };
    const m: Layer = Object.assign(newVectorLayer('Mask'), { id: 'm', mask: 'show' as const, folder: 'f' });
    doc.layers[1].folder = 'f';
    doc.layers.push(m);
    const plan = layeredPlan(doc);
    expect(plan[0].kind).toBe('layer');
    const g = plan[1];
    expect(g.kind).toBe('group');
    if (g.kind !== 'group') return;
    expect(g.passThrough).toBe(false);
    expect(g.masks.map((l) => l.id)).toEqual(['m']);
    expect(g.layers.map((l) => (l.kind === 'layer' ? [l.layer.id, l.hidden] : null))).toEqual([
      ['b', false],
      ['m', true],
    ]);
  });
});
