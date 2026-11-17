// Points as flat numbers in the file (src/io/packPoints.ts): the same coordinates exactly, both shapes of file read,
// and a file that holds them saved as the version an older Frameling refuses.
import { describe, expect, it } from 'vitest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import { FORMAT_VERSION, PACKED_POINTS_FORMAT_VERSION, type Doc, type PathPoint, type Shape } from '../../src/core/format';
import { loadFile, saveFile } from '../../src/io/file';
import { packPath, packShape, packStroke, unpackPath, unpackRawShape, unpackStroke, usesPackedPoints } from '../../src/io/packPoints';

const brush = { size: 6, thinning: 0.6, smoothing: 0.5, streamline: 0.5, taperStart: 0, taperEnd: 2, capStart: true, capEnd: false };

/** Coordinates with awkward decimals, so "exactly the same numbers" means something. */
const PTS = [
  { x: 1.0000001, y: -2.5, p: 0.5 },
  { x: 1234.56789012345, y: 0, p: 0.03125 },
  { x: -0.1, y: 1e-7, p: 1 },
];
const CURVE: PathPoint[] = [
  { x: 0, y: 0 },
  { x: 5.25, y: -0.125, c1: { x: 1.5, y: -2 }, c2: { x: 4.5, y: -2 } },
  { x: 9, y: 9, c1: { x: 7, y: 7 } },
  { x: 12, y: 1, c2: { x: 11, y: 2 } },
];

function docWithShapes(shapes: Shape[]): Doc {
  const doc = newDoc({ name: 'Packed', width: 64, height: 48, fps: 8, length: 2, background: null });
  const v = newVectorDrawing();
  v.shapes.push(...shapes);
  doc.drawings[v.id] = v;
  doc.layers[0].cels.push({ id: 'c1', start: 0, length: 1, drawingId: v.id });
  return doc;
}

const stroke = (): Shape => ({ id: 's1', type: 'stroke', points: PTS.map((p) => ({ ...p })), brush: { ...brush }, color: '#ff0000', opacity: 0.8 });
const path = (): Shape => ({ id: 's2', type: 'path', paths: [{ closed: true, points: CURVE.map((p) => ({ ...p })) }, { closed: false, points: [{ x: 1, y: 1 }] }], fill: '#00ff00', stroke: null, opacity: 1 });

const docJson = (bytes: Uint8Array) => JSON.parse(strFromU8(unzipSync(bytes)['doc.json']));
const shapesOf = (doc: Doc) => Object.values(doc.drawings).flatMap((d) => (d.kind === 'vector' ? d.shapes : []));

describe('packing one list of points', () => {
  it('writes a stroke as three numbers a point and reads back the same numbers', () => {
    const flat = packStroke(PTS);
    expect(flat).toEqual([1.0000001, -2.5, 0.5, 1234.56789012345, 0, 0.03125, -0.1, 1e-7, 1]);
    expect(unpackStroke(flat)).toEqual(PTS);
  });

  it('writes a curve with what each point has, straight points and one-sided ones included', () => {
    const flat = packPath(CURVE);
    expect(flat).toEqual([0, 0, 0, 3, 5.25, -0.125, 1.5, -2, 4.5, -2, 1, 9, 9, 7, 7, 2, 12, 1, 11, 2]);
    expect(unpackPath(flat)).toEqual(CURVE);
  });

  it('leaves nothing behind for an empty list, and keeps a list of objects as it is', () => {
    expect(packStroke([])).toEqual([]);
    expect(unpackStroke([])).toEqual([]);
    expect(packPath([])).toEqual([]);
    const already = { type: 'stroke', points: [{ x: 1, y: 2, p: 0.5 }] };
    unpackRawShape(already);
    expect(already.points).toEqual([{ x: 1, y: 2, p: 0.5 }]);
  });

  it('loses only the tail of a damaged list instead of everything', () => {
    // A part-point at the end.
    expect(unpackStroke([1, 2, 0.5, 9, 9])).toEqual([{ x: 1, y: 2, p: 0.5 }]);
    // A tag that says there are controls, with the numbers missing.
    expect(unpackPath([0, 1, 2, 3, 4, 5])).toEqual([{ x: 1, y: 2 }]);
    // Nonsense where a tag should be.
    expect(unpackPath([0, 1, 2, 77, 3, 4])).toEqual([{ x: 1, y: 2 }]);
  });

  it('packs a shape without touching the one it was given', () => {
    const s = stroke();
    const packed = packShape(s) as { points: number[] };
    expect(packed.points[0]).toBe(1.0000001);
    expect((s as { points: unknown[] }).points[0]).toEqual(PTS[0]);
    // A shape with no points at all comes straight back.
    const instance = { id: 'i', type: 'instance', symbolId: 's', frame: 0, matrix: [1, 0, 0, 1, 0, 0], opacity: 1 } as unknown as Shape;
    expect(packShape(instance)).toBe(instance);
  });
});

describe('a file with packed points', () => {
  it('holds flat numbers and opens back to exactly the same shapes', () => {
    const doc = docWithShapes([stroke(), path()]);
    const bytes = saveFile(doc, 'x');
    const raw = docJson(bytes);
    const saved = Object.values(raw.drawings)[0] as { shapes: any[] };
    expect(saved.shapes[0].points[0]).toBe(1.0000001);
    expect(saved.shapes[1].paths[0].points[0]).toBe(0);
    const back = loadFile(bytes).doc;
    expect(shapesOf(back)).toEqual(shapesOf(doc));
  });

  it('is smaller than the same document written the old way', () => {
    const many: Shape[] = [];
    for (let i = 0; i < 50; i++) many.push({ ...(stroke() as any), id: 's' + i, points: Array.from({ length: 40 }, (_, j) => ({ x: i + j / 3, y: j, p: 0.5 })) });
    const packed = strFromU8(unzipSync(saveFile(docWithShapes(many), 'x'))['doc.json']).length;
    const plain = JSON.stringify(many).length;
    expect(packed).toBeLessThan(plain);
  });

  it('is saved as the version an older Frameling refuses, and a document with no points is not', () => {
    const withPoints = docWithShapes([stroke()]);
    expect(usesPackedPoints(withPoints)).toBe(true);
    expect(docJson(saveFile(withPoints, 'x')).version).toBe(PACKED_POINTS_FORMAT_VERSION);
    const empty = docWithShapes([]);
    expect(usesPackedPoints(empty)).toBe(false);
    expect(docJson(saveFile(empty, 'x')).version).toBe(FORMAT_VERSION);
    // What the document itself says it is does not change: the version is the file's.
    expect(loadFile(saveFile(withPoints, 'x')).doc.version).toBe(FORMAT_VERSION);
  });

  it('still opens a file whose points are written the old way', () => {
    const doc = docWithShapes([stroke(), path()]);
    const files = unzipSync(saveFile(doc, 'x'));
    const raw = JSON.parse(strFromU8(files['doc.json']));
    const d = Object.values(raw.drawings)[0] as { shapes: any[] };
    d.shapes[0].points = PTS.map((p) => ({ ...p }));
    d.shapes[1].paths[0].points = CURVE.map((p) => ({ ...p }));
    d.shapes[1].paths[1].points = [{ x: 1, y: 1 }];
    raw.version = FORMAT_VERSION;
    files['doc.json'] = strToU8(JSON.stringify(raw));
    files['manifest.json'] = strToU8(JSON.stringify({ format: 'frameling', version: FORMAT_VERSION, app: 't', created: '', name: 'n' }));
    const back = loadFile(zipSync(files as never)).doc;
    expect(shapesOf(back)).toEqual(shapesOf(doc));
  });

  it('keeps a shape of a kind it does not know exactly as it was written, packed points and all', () => {
    const doc = docWithShapes([stroke()]);
    const v = Object.values(doc.drawings)[0];
    if (v.kind !== 'vector') throw new Error('vector');
    v.kept = [{ at: 1, shape: { id: 'k', type: 'future-thing', points: [1, 2, 3, 4, 5, 6] } }];
    const back = loadFile(saveFile(doc, 'x')).doc;
    const got = Object.values(back.drawings)[0];
    if (got.kind !== 'vector') throw new Error('vector');
    expect(got.kept).toEqual([{ at: 1, shape: { id: 'k', type: 'future-thing', points: [1, 2, 3, 4, 5, 6] } }]);
  });

  it('packs and unpacks the curve a text shape\'s words follow', () => {
    const raw: Record<string, any> = { id: 't', type: 'text', onPath: { source: 'p', curve: { closed: false, points: CURVE.map((p) => ({ ...p })) } } };
    const packed = packShape(raw as unknown as Shape) as any;
    expect(typeof packed.onPath.curve.points[0]).toBe('number');
    expect(raw.onPath.curve.points[0]).toEqual({ x: 0, y: 0 });
    unpackRawShape(packed);
    expect(packed.onPath.curve.points).toEqual(CURVE);
  });
});
