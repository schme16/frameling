// Saving keeps each vector drawing's text (UTF-8) between saves. The file must come out exactly as if the whole
// document had been written in one go, whether the drawings were seen before or not.
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { produce } from 'immer';
import { newDoc, newPixelDrawing, newPixelLayer, newTilemapDrawing, newVectorDrawing } from '../../src/core/doc';
import type { Doc } from '../../src/core/format';
import { loadFile, saveFile, saveFileAsync } from '../../src/io/file';
import { shapesForSave } from '../../src/io/ext';
import { setAutoFreeze } from 'immer';

setAutoFreeze(false);

const stroke = (id: string, extra: object = {}) => ({
  id,
  type: 'stroke' as const,
  points: [{ x: 1.5, y: 2, p: 0.5 }],
  brush: { size: 6, thinning: 0.6, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 2, capStart: true, capEnd: false },
  color: '#ff0000',
  opacity: 1,
  ...extra,
});

function sample(n = 30): Doc {
  const doc = newDoc({ name: 'Saves é😀 "quoted"', width: 64, height: 48, fps: 8, length: n, background: null });
  doc.drawings = {};
  doc.layers[0].cels = [];
  for (let i = 0; i < n; i++) {
    const d = { ...newVectorDrawing(), id: 'v' + i };
    d.shapes.push(stroke('s' + i, { ext: { note: 'café ☃ ' + i } }));
    if (i % 7 === 3) d.kept = [{ at: 0, shape: { id: 'k' + i, type: 'future-thing', data: [1, 2, 3] } }];
    doc.drawings[d.id] = d;
    doc.layers[0].cels.push({ id: 'c' + i, start: i, length: 1, drawingId: d.id });
  }
  const t = { ...newTilemapDrawing(3, 2), id: 'tm' };
  t.cells[4] = 9;
  doc.drawings[t.id] = t;
  const px = { ...newPixelDrawing(4, 4), id: 'px' };
  px.pixels[0] = 255;
  doc.drawings[px.id] = px;
  const empty = { ...newPixelDrawing(4, 4), id: 'empty' };
  doc.drawings[empty.id] = empty;
  const pl = newPixelLayer('Pixels', 8);
  pl.cels.push({ id: 'cp', start: 0, length: 2, drawingId: 'px' }, { id: 'ce', start: 2, length: 2, drawingId: 'empty' });
  doc.layers.push(pl);
  return doc;
}

/** doc.json as the straightforward whole-document stringify writes it (for a document of this kind). */
function reference(doc: Doc, bytesOf: Uint8Array): string {
  const saved = JSON.parse(strFromU8(unzipSync(bytesOf)['doc.json']));
  const drawings: Record<string, unknown> = {};
  for (const [id, d] of Object.entries(doc.drawings)) {
    if (d.kind === 'pixel') drawings[id] = saved.drawings[id];
    else if (d.kind === 'tilemap') drawings[id] = { ...d, cells: Array.from(d.cells) };
    else if (d.kind === 'vector' && d.kept?.length) {
      const { kept: _k, ...rest } = d;
      drawings[id] = { ...rest, shapes: shapesForSave(d) };
    } else drawings[id] = d;
  }
  return JSON.stringify({ ...doc, drawings, audio: undefined });
}

const docJson = (bytes: Uint8Array) => strFromU8(unzipSync(bytes)['doc.json']);
const NOW = new Date('2026-01-01T00:00:00Z');

describe('saving with kept drawing text', () => {
  it('writes doc.json exactly as one whole stringify would, first time and again', () => {
    const doc = sample();
    const first = saveFile(doc, 't', NOW);
    expect(docJson(first)).toBe(reference(doc, first));
    const second = saveFile(doc, 't', NOW);
    expect(docJson(second)).toBe(docJson(first));
    expect(second).toEqual(first);
  });

  it('after an edit, only the edited drawing changes and the file is still exact', () => {
    const doc = sample();
    saveFile(doc, 't', NOW);
    const next = produce(doc, (d) => {
      const v = d.drawings.v5;
      if (v.kind === 'vector') v.shapes.push(stroke('extra') as any);
      delete d.drawings.v6;
      d.layers[0].cels = d.layers[0].cels.filter((c) => c.drawingId !== 'v6');
      const k = d.drawings.v3;
      if (k.kind === 'vector') k.kept = [];
    });
    const bytes = saveFile(next, 't', NOW);
    expect(docJson(bytes)).toBe(reference(next, bytes));
    // A save of a copy the cache never saw gives the same file.
    const cold = saveFile(structuredClone(next), 't', NOW);
    expect(docJson(cold)).toBe(docJson(bytes));
  });

  it('a drawing changed in place under the same object is not served stale', () => {
    const doc = sample(4);
    saveFile(doc, 't', NOW);
    const v = doc.drawings.v1;
    if (v.kind !== 'vector') throw new Error('x');
    v.shapes = [...v.shapes, stroke('late') as any];
    expect(docJson(saveFile(doc, 't', NOW))).toContain('"late"');
  });

  it('opens back to the same document', () => {
    const doc = sample();
    saveFile(doc, 't', NOW);
    const back = loadFile(saveFile(doc, 't', NOW)).doc;
    expect(Object.keys(back.drawings).sort()).toEqual(Object.keys(doc.drawings).sort());
    const v = back.drawings.v3;
    expect(v.kind === 'vector' && v.kept?.length).toBe(1);
    expect(back.name).toBe(doc.name);
  });

  it('the async save writes the same bytes of doc.json', async () => {
    const doc = sample(5);
    expect(docJson(await saveFileAsync(doc, 't', NOW))).toBe(docJson(saveFile(doc, 't', NOW)));
  });

  it('a document whose name holds the marker text still saves correctly', () => {
    const doc = sample(3);
    doc.name = '\u0000frameling-drawings\u0000';
    const bytes = saveFile(doc, 't', NOW);
    expect(docJson(bytes)).toBe(reference(doc, bytes));
  });
});
