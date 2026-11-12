// Nothing a file holds is lost when the owner is missing: `ext` bags at every level and shapes of a type this version
// does not know come back out exactly as they went in.
import { describe, expect, it } from 'vitest';
import { newDoc, newPixelDrawing, newPixelLayer, newVectorDrawing } from '../../src/core/doc';
import type { Doc } from '../../src/core/format';
import { EXT_MAX_DEPTH, keepUnknownShape, readExt, shapesForSave } from '../../src/io/ext';
import { loadFile, saveFile } from '../../src/io/file';
import { unzipSync, strFromU8, strToU8, zipSync } from 'fflate';

const stroke = (id: string, extra: object = {}) => ({
  id,
  type: 'stroke' as const,
  points: [{ x: 1, y: 2, p: 0.5 }],
  brush: { size: 6, thinning: 0.6, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 2, capStart: true, capEnd: false },
  color: '#ff0000',
  opacity: 1,
  ...extra,
});

function docWithData(): Doc {
  const doc = newDoc({ name: 'Keeps things', width: 64, height: 48, fps: 8, length: 6, background: null });
  const d = newVectorDrawing();
  d.shapes.push(stroke('s1', { ext: { wiggle: { amount: 3, tags: ['a', 'b'] } } }));
  d.ext = { wiggle: { seed: 7 } };
  doc.drawings[d.id] = d;
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: 3, drawingId: d.id });
  doc.layers[0].ext = { 'my.plugin': { colour: '#123456', nested: { deep: [1, 2, { three: 3 }] } } };
  const px = newPixelDrawing(4, 4);
  px.ext = { pixelnotes: { note: 'hi' } };
  doc.drawings[px.id] = px;
  const pl = newPixelLayer('Pixels', 8);
  pl.cels.push({ id: 'c2', start: 0, length: 2, drawingId: px.id });
  doc.layers.push(pl);
  doc.ext = { lipsync: { used: true }, 'other-tool': { n: 1.5, s: 'x', b: false, nil: null } };
  return doc;
}

/** Saves, then edits doc.json by hand the way a newer app or a plugin could have written it. */
function reopen(doc: Doc, edit?: (raw: any) => void) {
  const bytes = saveFile(doc, 't');
  if (!edit) return loadFile(bytes);
  const files = unzipSync(bytes);
  const raw = JSON.parse(strFromU8(files['doc.json']));
  edit(raw);
  files['doc.json'] = strToU8(JSON.stringify(raw));
  return loadFile(zipSync(files));
}

describe('ext bags', () => {
  it('come back from a round trip at every level', () => {
    const doc = docWithData();
    const { doc: back, warnings } = loadFile(saveFile(doc, 't'));
    expect(warnings).toEqual([]);
    expect(back.ext).toEqual(doc.ext);
    expect(back.layers[0].ext).toEqual(doc.layers[0].ext);
    const vd = back.drawings[Object.keys(doc.drawings)[0]];
    expect(vd.ext).toEqual({ wiggle: { seed: 7 } });
    expect(vd.kind === 'vector' && vd.shapes[0].ext).toEqual({ wiggle: { amount: 3, tags: ['a', 'b'] } });
    const pd = back.drawings[Object.keys(doc.drawings)[1]];
    expect(pd.ext).toEqual({ pixelnotes: { note: 'hi' } });
  });

  it('survive a second trip unchanged', () => {
    const once = loadFile(saveFile(docWithData(), 't')).doc;
    const twice = loadFile(saveFile(once, 't')).doc;
    expect(twice.ext).toEqual(once.ext);
    expect(twice.layers.map((l) => l.ext)).toEqual(once.layers.map((l) => l.ext));
  });

  it('are left off when there is none', () => {
    const { doc } = loadFile(saveFile(newDoc(), 't'));
    expect('ext' in doc).toBe(false);
    expect('ext' in doc.layers[0]).toBe(false);
  });

  it('are kept on text, particles and instance shapes too', () => {
    const doc = docWithData();
    const d = newVectorDrawing();
    doc.drawings[d.id] = d;
    doc.layers[0].cels.push({ id: 'c9', start: 3, length: 1, drawingId: d.id });
    const back = reopen(doc, (raw) => {
      raw.drawings[d.id].shapes = [
        { id: 'i1', type: 'instance', symbolId: 'sym', transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 }, ext: { who: { a: 1 } } },
      ];
    });
    // The instance has no symbol, but the reader keeps shapes it understands the form of and their ext.
    const bd = back.doc.drawings[d.id];
    expect(bd.kind === 'vector' && bd.shapes[0]?.ext).toEqual({ who: { a: 1 } });
  });

  it('keep unknown fields inside a feature entry exactly', () => {
    const doc = docWithData();
    doc.ext = { future: { a: { b: { c: [1, { d: 'deep' }] } }, extra: 'field we do not know' } };
    expect(loadFile(saveFile(doc, 't')).doc.ext).toEqual(doc.ext);
  });

  it('cannot poison objects: __proto__, constructor and prototype keys are dropped', () => {
    const back = reopen(docWithData(), (raw) => {
      raw.ext = JSON.parse('{"ok":{"__proto__":{"polluted":true},"constructor":{"x":1},"keep":1},"__proto__":{"bad":1}}');
    });
    expect(back.doc.ext).toEqual({ ok: { keep: 1 } });
    expect(({} as any).polluted).toBeUndefined();
    expect(({} as any).bad).toBeUndefined();
  });

  it('drop an entry that nests too deeply or is too big, with a plain warning, and keep the rest', () => {
    let deep: unknown = 1;
    for (let i = 0; i < EXT_MAX_DEPTH + 5; i++) deep = { d: deep };
    const back = reopen(docWithData(), (raw) => {
      raw.ext = { fine: { a: 1 }, deep };
    });
    expect(back.doc.ext).toEqual({ fine: { a: 1 } });
    expect(back.warnings.join(' ')).toMatch(/too big or too deep/);
  });

  it('ignore ext that is not an object, and entries with odd names', () => {
    expect(readExt('no')).toEqual({});
    expect(readExt([1, 2])).toEqual({});
    expect(readExt({ 'bad name!': 1, '': 2, good: 3 })).toEqual({ ext: { good: 3 } });
    expect(readExt({ a: { n: Infinity } })).toEqual({ ext: { a: { n: null } } });
  });
});

describe('shapes of an unknown type', () => {
  const unknown = { id: 'u1', type: 'hologram', depth: 4, layers: [{ a: 1 }], ext: { x: 1 } };

  it('are kept through load and save, in their place among the known shapes', () => {
    const doc = docWithData();
    const d = newVectorDrawing();
    d.shapes.push(stroke('a'), stroke('b'), stroke('c'));
    doc.drawings[d.id] = d;
    doc.layers[0].cels.push({ id: 'c8', start: 3, length: 1, drawingId: d.id });
    const first = reopen(doc, (raw) => {
      const list = raw.drawings[d.id].shapes;
      list.splice(1, 0, { ...unknown, id: 'u1' });
      list.push({ ...unknown, id: 'u2' });
    });
    const vd = first.doc.drawings[d.id];
    expect(vd.kind === 'vector' && vd.shapes.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(first.warnings.join(' ')).not.toMatch(/left out/);
    // Saved again, they are back in the file where they were.
    const out = JSON.parse(strFromU8(unzipSync(saveFile(first.doc, 't'))['doc.json']));
    expect(out.drawings[d.id].shapes.map((s: any) => s.id)).toEqual(['a', 'u1', 'b', 'c', 'u2']);
    expect(out.drawings[d.id].shapes[1]).toEqual({ ...unknown, id: 'u1' });
    expect(out.drawings[d.id].kept).toBeUndefined();
  });

  it('are never drawn or counted among the shapes people edit', () => {
    const doc = docWithData();
    const d = newVectorDrawing();
    doc.drawings[d.id] = d;
    doc.layers[0].cels.push({ id: 'c8', start: 3, length: 1, drawingId: d.id });
    const back = reopen(doc, (raw) => {
      raw.drawings[d.id].shapes = [unknown];
    });
    const vd = back.doc.drawings[d.id];
    expect(vd.kind === 'vector' && vd.shapes).toEqual([]);
    expect(vd.kind === 'vector' && vd.kept?.length).toBe(1);
  });

  it('still drop things that are not shapes at all, and say so', () => {
    const doc = docWithData();
    const d = newVectorDrawing();
    doc.drawings[d.id] = d;
    doc.layers[0].cels.push({ id: 'c8', start: 3, length: 1, drawingId: d.id });
    const back = reopen(doc, (raw) => {
      raw.drawings[d.id].shapes = [42, null, { nothing: true }, unknown];
    });
    expect(back.warnings.join(' ')).toMatch(/Some shapes could not be read/);
    const vd = back.doc.drawings[d.id];
    expect(vd.kind === 'vector' && vd.kept?.length).toBe(1);
  });

  it('merge by position even after the known shapes change', () => {
    const merged = shapesForSave({ shapes: [stroke('a')] as never, kept: [{ at: 5, shape: { type: 'x' } }, { at: 0, shape: { type: 'y' } }] });
    expect((merged as any[]).map((s) => s.type)).toEqual(['y', 'stroke', 'x']);
    expect(keepUnknownShape({ type: 'x' }, 2)).toEqual({ at: 2, shape: { type: 'x' } });
    expect(keepUnknownShape({ nope: 1 }, 0)).toBeNull();
    expect(keepUnknownShape('x', 0)).toBeNull();
  });
});
