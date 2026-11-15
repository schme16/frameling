import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { newDoc } from '../../src/core/doc';
import type { CanvasMark } from '../../src/core/format';
import { loadFile, saveFile } from '../../src/io/file';
import { makeMark, readMarks } from '../../src/notes/marks';
import { ladder, isPixelDrawing, REVIEW_BUDGET } from '../../src/review/frames';
import { withoutNotes } from '../../src/notes/model';

describe('who drew a mark, and when (optional, so old files are unchanged)', () => {
  it('reads by and at, trims the name, and drops what is not a name or a time', () => {
    const out = readMarks([
      { id: 'a', kind: 'arrow', pts: [1, 2, 3, 4], by: '  Anna ', at: 1_700_000_000_000 },
      { id: 'b', kind: 'arrow', pts: [1, 2, 3, 4], by: 7, at: 'yesterday' },
      { id: 'c', kind: 'arrow', pts: [1, 2, 3, 4], by: '   ', at: -5 },
      { id: 'd', kind: 'arrow', pts: [1, 2, 3, 4], by: 'x'.repeat(300) },
    ])!;
    expect(out[0]).toMatchObject({ by: 'Anna', at: 1_700_000_000_000 });
    for (const m of [out[1], out[2]]) {
      expect(m).not.toHaveProperty('by');
      expect(m).not.toHaveProperty('at');
    }
    expect(out[3].by).toHaveLength(80);
  });
  it('a mark without them reads back exactly as it always did', () => {
    const marks: CanvasMark[] = [{ id: 'a', kind: 'circle', pts: [1, 2, 3, 4], color: '#3b82f6', pin: 'frame', frame: 2 }];
    expect(readMarks(marks)).toEqual(marks);
    expect(Object.keys(makeMark({ id: 'x', kind: 'arrow', pts: [1, 2, 3, 4], pin: 'page', frame: 0 })).sort()).toEqual(['id', 'kind', 'pts']);
  });
  it('makeMark writes them only when given', () => {
    expect(makeMark({ id: 'x', kind: 'arrow', pts: [1, 2, 3, 4], pin: 'page', frame: 0, by: ' Bo ', at: 9 })).toMatchObject({ by: 'Bo', at: 9 });
  });
  it('are saved in the file and come back, and an older file without them still opens', () => {
    const d = newDoc({ width: 64, height: 64 });
    d.marks = [{ id: 'a', kind: 'arrow', pts: [1, 2, 3, 4], by: 'Anna', at: 12345 }, { id: 'b', kind: 'circle', pts: [1, 2, 3, 4] }];
    const back = loadFile(saveFile(d, 'test')).doc;
    expect(back.marks).toEqual(d.marks);
    const files = unzipSync(saveFile(d, 'test'));
    const json = JSON.parse(strFromU8(files['doc.json']));
    for (const m of json.marks) {
      delete m.by;
      delete m.at;
    }
    files['doc.json'] = strToU8(JSON.stringify(json));
    const old = loadFile(zipSync(files)).doc;
    expect(old.marks).toEqual([{ id: 'a', kind: 'arrow', pts: [1, 2, 3, 4] }, { id: 'b', kind: 'circle', pts: [1, 2, 3, 4] }]);
    expect(old.width).toBe(64);
  });
  it('are still never exported', () => {
    const d = newDoc({ width: 64, height: 64 });
    d.marks = [{ id: 'a', kind: 'arrow', pts: [1, 2, 3, 4], by: 'Anna', at: 1 }];
    expect(withoutNotes(d)).not.toHaveProperty('marks');
  });
});

describe('sizing the pictures on a review page', () => {
  const vector = { width: 800, height: 400, layers: [{ kind: 'vector' }] } as never;
  it('tries sharp lossless first, then smaller and lossier', () => {
    const steps = ladder(vector);
    expect(steps[0]).toEqual({ long: 960, type: 'image/png' });
    expect(steps.slice(1).every((s) => s.type === 'image/webp')).toBe(true);
    const longs = steps.map((s) => s.long);
    expect(longs).toEqual([...longs].sort((a, b) => b - a));
  });
  it('never draws a small drawing bigger than twice its size', () => {
    expect(ladder({ width: 100, height: 50, layers: [{ kind: 'vector' }] } as never)[0].long).toBe(200);
  });
  it('a pixel drawing is only ever drawn at its own size', () => {
    const px = { width: 64, height: 48, layers: [{ kind: 'pixel' }, { kind: 'pixel' }] } as never;
    expect(isPixelDrawing(px)).toBe(true);
    expect(ladder(px)).toEqual([{ long: 64, type: 'image/png' }]);
    expect(isPixelDrawing({ layers: [{ kind: 'pixel' }, { kind: 'vector' }] } as never)).toBe(false);
  });
  it('the budget is a few megabytes, small enough to send', () => {
    expect(REVIEW_BUDGET).toBeLessThanOrEqual(5_000_000);
  });
});
