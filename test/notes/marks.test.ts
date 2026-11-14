import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import type { CanvasMark, Doc } from '../../src/core/format';
import { loadFile, saveFile } from '../../src/io/file';
import { arrowHead, boundsOf, capPoints, countMarks, DEFAULT_COLOR, hitMark, haloFor, makeMark, markAt, MAX_MARKS, MAX_POINTS, readMarks, simplify, smoothPath, textSize, visibleMarks, worthKeeping } from '../../src/notes/marks';

const doc = (): Doc => {
  const d = newDoc({ name: 'T', width: 200, height: 200 });
  d.length = 12;
  const l = Object.assign(newVectorLayer('Lines'), { id: 'L1' });
  l.cels = [{ id: 'c1', start: 6, length: 2, drawingId: 'dx' }];
  d.layers = [l];
  return d;
};

const marks: CanvasMark[] = [
  { id: 'a', kind: 'arrow', pts: [10, 10, 60, 40] },
  { id: 'b', kind: 'circle', pts: [20, 20, 80, 70], color: '#3b82f6', w: 5, pin: 'frame', frame: 3 },
  { id: 'c', kind: 'scribble', pts: [0, 0, 5, 9, 12, 3, 20, 20], pin: 'layer', layer: 'L1' },
  { id: 'd', kind: 'text', pts: [40, 40], text: 'raise this', w: 4 },
];

describe('reading marks from a file', () => {
  it('keeps well-formed marks as they are', () => {
    expect(readMarks(marks)).toEqual(marks);
  });
  it('says nothing for a missing, empty or non-list value', () => {
    expect(readMarks(undefined)).toBeUndefined();
    expect(readMarks([])).toBeUndefined();
    expect(readMarks('nope')).toBeUndefined();
    expect(readMarks({})).toBeUndefined();
  });
  it('drops marks that are damaged and keeps the rest', () => {
    const out = readMarks([
      { id: 'ok', kind: 'arrow', pts: [1, 2, 3, 4] },
      { id: 'kind', kind: 'laser', pts: [1, 2, 3, 4] },
      { id: 'short', kind: 'arrow', pts: [1, 2] },
      { id: 'long', kind: 'arrow', pts: [1, 2, 3, 4, 5, 6] },
      { id: 'nan', kind: 'arrow', pts: [1, 2, 3, null] },
      { id: 'inf', kind: 'circle', pts: [1, 2, 3, Infinity] },
      { id: 'nowords', kind: 'text', pts: [1, 2] },
      { id: 'blank', kind: 'text', pts: [1, 2], text: '   ' },
      { id: 'pts', kind: 'scribble', pts: 'many' },
      'junk',
      null,
    ]);
    expect(out!.map((m) => m.id)).toEqual(['ok']);
  });
  it('repairs the small things: an odd trailing number, a bad colour, a wild width, a bad pin, a repeated id', () => {
    const out = readMarks([
      { id: 'x', kind: 'scribble', pts: [0, 0, 1, 1, 2] },
      { id: 'x', kind: 'arrow', pts: [0, 0, 1, 1], color: 'red', w: 99, pin: 'frame', frame: 'soon' },
      { id: 'y', kind: 'arrow', pts: [0, 0, 1, 1], pin: 'layer' },
      { id: 'z', kind: 'arrow', pts: [0, 0, 1, 1], color: '#FF3B5C', w: 3, board: 'b1' },
    ])!;
    expect(out[0].pts).toEqual([0, 0, 1, 1]);
    expect(out[1].id).not.toBe('x');
    expect(out[1]).toMatchObject({ w: 16 });
    expect(out[1].color).toBeUndefined();
    expect(out[1].pin).toBeUndefined();
    expect(out[2].pin).toBeUndefined();
    // The default colour and width are not written down.
    expect(out[3].color).toBeUndefined();
    expect(out[3].w).toBeUndefined();
    expect(out[3].board).toBe('b1');
  });
  it('caps how many marks and how long a scribble, so a hand-made file cannot be huge', () => {
    const many = Array.from({ length: MAX_MARKS + 50 }, (_, i) => ({ id: 'm' + i, kind: 'arrow', pts: [0, 0, 1, 1] }));
    expect(readMarks(many)).toHaveLength(MAX_MARKS);
    const long = { id: 'l', kind: 'scribble', pts: new Array((MAX_POINTS + 1) * 2).fill(1) };
    expect(readMarks([long])).toBeUndefined();
  });
  it('cuts text to a sensible length', () => {
    const out = readMarks([{ id: 't', kind: 'text', pts: [0, 0], text: 'x'.repeat(5000) }])!;
    expect(out[0].text).toHaveLength(500);
  });
});

describe('marks in the file', () => {
  const roundTrip = (d: Doc) => loadFile(saveFile(d, 'test'));
  const docJson = (bytes: Uint8Array) => JSON.parse(strFromU8(unzipSync(bytes)['doc.json']));
  it('are saved and come back exactly', () => {
    const d = doc();
    d.marks = marks;
    const back = roundTrip(d);
    expect(back.doc.marks).toEqual(marks);
    expect(roundTrip(back.doc).doc.marks).toEqual(marks);
  });
  it('are left out of the file when there are none', () => {
    const d = doc();
    expect('marks' in docJson(saveFile(d, 'test'))).toBe(false);
    expect(roundTrip(d).doc.marks).toBeUndefined();
  });
  it('an older file without them opens as it always did', () => {
    const files = unzipSync(saveFile(doc(), 'test'));
    const json = JSON.parse(strFromU8(files['doc.json']));
    delete json.marks;
    files['doc.json'] = strToU8(JSON.stringify(json));
    const back = loadFile(zipSync(files));
    expect(back.doc.marks).toBeUndefined();
    expect(back.doc.width).toBe(200);
  });
  it('damaged ones are dropped and the rest of the file still opens', () => {
    const files = unzipSync(saveFile(doc(), 'test'));
    const json = JSON.parse(strFromU8(files['doc.json']));
    json.marks = [{ id: 'ok', kind: 'arrow', pts: [1, 2, 3, 4] }, { id: 'bad', kind: 'arrow' }, 'junk'];
    files['doc.json'] = strToU8(JSON.stringify(json));
    expect(loadFile(zipSync(files)).doc.marks!.map((m) => m.id)).toEqual(['ok']);
    json.marks = 7;
    files['doc.json'] = strToU8(JSON.stringify(json));
    expect(loadFile(zipSync(files)).doc.marks).toBeUndefined();
  });
  it('notes and marks sit side by side without disturbing each other', () => {
    const d = doc();
    d.marks = marks;
    d.notes = [{ id: 'n', x: 1, y: 2, text: 'hi' }];
    const back = roundTrip(d).doc;
    expect(back.marks).toEqual(marks);
    expect(back.notes).toHaveLength(1);
  });
});

describe('which marks show', () => {
  const d = (): Doc => ({ ...doc(), marks });
  it('page marks always, frame marks on their frame, layer marks while their layer has a drawing', () => {
    expect(visibleMarks(d(), 0).map((m) => m.id)).toEqual(['a', 'd']);
    expect(visibleMarks(d(), 3).map((m) => m.id)).toEqual(['a', 'b', 'd']);
    expect(visibleMarks(d(), 6).map((m) => m.id)).toEqual(['a', 'c', 'd']);
  });
  it('a layer mark whose layer is gone becomes a page mark', () => {
    const x = d();
    x.layers = [];
    expect(visibleMarks(x, 0).map((m) => m.id)).toContain('c');
  });
  it('none while a symbol is open', () => {
    const x = { ...d(), editing: [{ symbolId: 's', layers: [], length: 1, frame: 0 }] } as unknown as Doc;
    expect(visibleMarks(x, 0)).toEqual([]);
    expect(countMarks(x, 0)).toEqual({ all: 0, here: 0 });
  });
  it('belong to the artboard they were drawn on', () => {
    const x = d();
    x.artboards = [{ id: 'b1', name: 'One' }, { id: 'b2', name: 'Two' }] as never;
    x.activeArtboard = 'b2';
    x.marks = [{ id: 'p', kind: 'arrow', pts: [0, 0, 5, 5], board: 'b1' }, { id: 'q', kind: 'arrow', pts: [0, 0, 5, 5], board: 'b2' }, { id: 'r', kind: 'arrow', pts: [0, 0, 5, 5] }];
    expect(visibleMarks(x, 0).map((m) => m.id)).toEqual(['q', 'r']);
  });
  it('counts the marks on the page and on this frame', () => {
    expect(countMarks(d(), 3)).toEqual({ all: 4, here: 3 });
    expect(countMarks(doc(), 3)).toEqual({ all: 0, here: 0 });
  });
});

describe('making a mark', () => {
  const spec = { id: 'm', kind: 'arrow' as const, pts: [1.234, 2, 3, 4.96], pin: 'page' as const, frame: 5 };
  it('rounds the points and writes down only what differs from the defaults', () => {
    expect(makeMark(spec)).toEqual({ id: 'm', kind: 'arrow', pts: [1.2, 2, 3, 5] });
    expect(makeMark({ ...spec, color: DEFAULT_COLOR, w: 3 })).toEqual({ id: 'm', kind: 'arrow', pts: [1.2, 2, 3, 5] });
    expect(makeMark({ ...spec, color: '#3b82f6', w: 6.4 })).toMatchObject({ color: '#3b82f6', w: 6 });
    expect(makeMark({ ...spec, w: 400 }).w).toBe(16);
  });
  it('belongs to a frame, a layer or the page', () => {
    expect(makeMark({ ...spec, pin: 'frame' })).toMatchObject({ pin: 'frame', frame: 5 });
    expect(makeMark({ ...spec, pin: 'layer', layer: 'L1' })).toMatchObject({ pin: 'layer', layer: 'L1' });
    expect(makeMark({ ...spec, pin: 'layer' }).pin).toBeUndefined();
  });
  it('keeps the words of a text mark', () => {
    expect(makeMark({ id: 't', kind: 'text', pts: [0, 0], text: 'hello', pin: 'page', frame: 0 }).text).toBe('hello');
  });
  it('a tap is not worth keeping, a drag is', () => {
    expect(worthKeeping('arrow', [10, 10, 11, 10], 6)).toBe(false);
    expect(worthKeeping('arrow', [10, 10, 40, 10], 6)).toBe(true);
    expect(worthKeeping('circle', [10, 10, 12, 12], 6)).toBe(false);
    expect(worthKeeping('scribble', [10, 10], 6)).toBe(false);
    expect(worthKeeping('scribble', [10, 10, 30, 12], 6)).toBe(true);
    expect(worthKeeping('text', [10, 10], 6)).toBe(true);
  });
});

describe('shapes', () => {
  it('works out the box round some points', () => {
    expect(boundsOf([5, 9, 1, 2, 7, 4])).toEqual({ x: 1, y: 2, w: 6, h: 7 });
    expect(boundsOf([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
  it('an arrowhead sits at the tip, opens back along the shaft, and an arrow with no length has none', () => {
    const [ax, ay, bx, by] = arrowHead(0, 0, 100, 0, 20)!;
    expect(ax).toBeLessThan(100);
    expect(bx).toBeLessThan(100);
    expect(ay).toBeCloseTo(-by, 6);
    expect(Math.hypot(100 - ax, ay)).toBeCloseTo(20, 6);
    expect(arrowHead(5, 5, 5, 5, 20)).toBeNull();
    // A short arrow's head shrinks to fit.
    const [sx] = arrowHead(0, 0, 10, 0, 50)!;
    expect(10 - sx).toBeLessThan(10);
  });
  it('simplifies a stroke without losing its corners', () => {
    const line = [0, 0, 1, 0.01, 2, 0, 3, 0.02, 4, 0, 5, 0.01, 10, 0];
    expect(simplify(line, 0.5)).toEqual([0, 0, 10, 0]);
    const corner = [0, 0, 5, 0, 10, 0, 10, 5, 10, 10];
    expect(simplify(corner, 0.5)).toEqual([0, 0, 10, 0, 10, 10]);
    expect(simplify([1, 2], 1)).toEqual([1, 2]);
  });
  it('cuts a very long stroke back, keeping both ends', () => {
    const pts: number[] = [];
    for (let i = 0; i < 5000; i++) pts.push(i, i * 2);
    const cut = capPoints(pts, 100);
    expect(cut).toHaveLength(200);
    expect(cut.slice(0, 2)).toEqual([0, 0]);
    expect(cut.slice(-2)).toEqual([4999, 9998]);
    expect(capPoints([1, 2, 3, 4], 100)).toEqual([1, 2, 3, 4]);
  });
  it('writes a smooth path, and a dot for a single point', () => {
    expect(smoothPath([])).toBe('');
    expect(smoothPath([1, 2, 3, 4])).toBe('M1 2L3 4');
    expect(smoothPath([0, 0, 10, 10, 20, 0])).toBe('M0 0Q10 10 15 5L20 0');
    expect(smoothPath([4, 4])).toContain('M4 4');
  });
  it('picks a halo that shows against the pen', () => {
    expect(haloFor('#ffffff')).toMatch(/^rgba\(20/);
    expect(haloFor('#ffd60a')).toMatch(/^rgba\(20/);
    expect(haloFor('#1d1b26')).toMatch(/^rgba\(255/);
    expect(haloFor('#ff3b5c')).toMatch(/^rgba\(255/);
    expect(haloFor('#fff')).toMatch(/^rgba\(20/);
  });
});

describe('what a click lands on', () => {
  const m = (o: Partial<CanvasMark> & Pick<CanvasMark, 'kind' | 'pts'>): CanvasMark => ({ id: 'x', ...o });
  it('an arrow or a scribble, along its line', () => {
    const a = m({ kind: 'arrow', pts: [0, 0, 100, 0] });
    expect(hitMark(a, 50, 3, 5)).toBe(true);
    expect(hitMark(a, 50, 9, 5)).toBe(false);
    expect(hitMark(a, 110, 0, 5)).toBe(false);
    const s = m({ kind: 'scribble', pts: [0, 0, 10, 10, 20, 0] });
    expect(hitMark(s, 10, 9, 3)).toBe(true);
    expect(hitMark(s, 10, 0, 3)).toBe(false);
  });
  it('a circle on its edge, not in the middle', () => {
    const c = m({ kind: 'circle', pts: [0, 0, 100, 100] });
    expect(hitMark(c, 50, 0, 4)).toBe(true);
    expect(hitMark(c, 100, 50, 4)).toBe(true);
    expect(hitMark(c, 50, 50, 4)).toBe(false);
    expect(hitMark(c, 50, 30, 4)).toBe(false);
  });
  it('a text mark anywhere in its box', () => {
    const t = m({ kind: 'text', pts: [10, 10], text: 'hello' });
    expect(hitMark(t, 20, 10 + textSize(t) / 2, 2)).toBe(true);
    expect(hitMark(t, 300, 10, 2)).toBe(false);
  });
  it('the last one drawn is the one that is found', () => {
    const list = [m({ id: 'under', kind: 'arrow', pts: [0, 0, 100, 0] }), m({ id: 'over', kind: 'arrow', pts: [0, 0, 100, 0] })];
    expect(markAt(list, 50, 0, 3)!.id).toBe('over');
    expect(markAt(list, 50, 50, 3)).toBeUndefined();
  });
});
