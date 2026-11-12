// A plugin's own kind of shape: stored as ordinary shapes with its data in `ext`, so a file opens, draws and saves
// without the plugin.
import { describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { Doc, PathShape } from '../../src/core/format';
import { loadFile, saveFile } from '../../src/io/file';
import { rotateAbout, scaleAbout, shapesBounds, transformShapes } from '../../src/canvas/geometry';
import { Store } from '../../src/core/store';
import { sanitizeDrawList } from '../../src/plugins/drawlist';
import { missingPluginNotes } from '../../src/plugins/docPrompt';
import { addPluginShape, extKeyOf, findInst, infoOf, pickRef, pluginsUsedBy, redrawPluginShape, refit, ShapeProblem } from '../../src/plugins/shapes';

const star = (r: number) =>
  sanitizeDrawList([
    { type: 'polygon', points: [[0, -r], [r, r], [-r, r]], fill: '#ffcc00', stroke: '#333333', width: 2 },
    { type: 'ellipse', cx: 0, cy: 0, rx: 3, ry: 3, fill: '#ff0000' },
  ]);

function setup() {
  const doc: Doc = newDoc({ width: 200, height: 100 });
  doc.drawings = { dv: { ...newVectorDrawing(), id: 'dv' } };
  return new Store(doc);
}

const add = (s: Store, r: number, at = { x: 100, y: 50 }) => {
  let out!: { inst: string; ids: string[] };
  s.update('Add star', (d) => void (out = addPluginShape(d, { drawingId: 'dv', pluginId: 'star-kit', kind: 'star', props: { r }, list: star(r), at })));
  return out;
};
const shapesOf = (s: Store) => (s.get().doc.drawings.dv as { shapes: PathShape[] }).shapes;

describe('plugin shapes', () => {
  it('adds ordinary grouped path shapes, each carrying the plugin data, in one undo step', () => {
    const s = setup();
    const { inst, ids } = add(s, 20);
    const shapes = shapesOf(s);
    expect(shapes.map((x) => x.id)).toEqual(ids);
    expect(shapes.every((x) => x.type === 'path' && x.group === `pg-${inst}`)).toBe(true);
    expect(infoOf(shapes[0], 'star-kit')).toMatchObject({ kind: 'star', inst, part: 0, props: { r: 20 } });
    // Only the first part keeps the settings; the others name the same shape.
    expect(infoOf(shapes[1], 'star-kit')).toMatchObject({ inst, part: 1 });
    expect(infoOf(shapes[1], 'star-kit')?.props).toBeUndefined();
    const b = shapesBounds(shapes)!;
    expect(b.x + b.w / 2).toBeCloseTo(100, 0);
    s.undo();
    expect(shapesOf(s)).toEqual([]);
  });

  it('redraws from new settings in place: same spot, same place in the stack, still one group', () => {
    const s = setup();
    const a = add(s, 20, { x: 50, y: 50 });
    const other = add(s, 5, { x: 150, y: 50 });
    s.update('Redraw', (d) => void redrawPluginShape(d, { pluginId: 'star-kit', kind: 'star', props: { r: 40 }, list: star(40), inst: a.inst, drawingId: 'dv' }));
    const shapes = shapesOf(s);
    const mine = shapes.filter((x) => infoOf(x, 'star-kit')?.inst === a.inst);
    expect(infoOf(mine[0], 'star-kit')?.props).toEqual({ r: 40 });
    expect(shapes.slice(-2).map((x) => x.id)).toEqual(other.ids);
    const b = shapesBounds(mine)!;
    expect(b.w).toBeGreaterThan(60);
    expect(b.x + b.w / 2).toBeCloseTo(50, 0);
    expect(findInst(s.get().doc, 'star-kit', a.inst)?.indexes).toEqual([0, 1]);
    expect(() => s.update('x', (d) => void redrawPluginShape(d, { pluginId: 'star-kit', kind: 'star', props: {}, list: [], inst: 'gone' }))).toThrow(ShapeProblem);
  });

  describe('redrawing a shape the person has moved, scaled or turned', () => {
    const redraw = (s: Store, inst: string, r: number) => s.update('Redraw', (d) => void redrawPluginShape(d, { pluginId: 'star-kit', kind: 'star', props: { r }, list: star(r), inst, drawingId: 'dv' }));
    const apply = (s: Store, m: ReturnType<typeof scaleAbout>) => s.update('Move', (d) => void ((d.drawings.dv as { shapes: PathShape[] }).shapes = transformShapes(shapesOf(s), m) as PathShape[]));
    const box = (s: Store, inst: string) => shapesBounds(shapesOf(s).filter((x) => infoOf(x, 'star-kit')?.inst === inst))!;

    it('keeps a move', () => {
      const s = setup();
      const a = add(s, 20, { x: 50, y: 50 });
      apply(s, [1, 0, 0, 1, 70, 10]);
      redraw(s, a.inst, 20);
      const b = box(s, a.inst);
      expect(b.x + b.w / 2).toBeCloseTo(120, 0);
    });

    it('keeps a scale: the new drawing comes out as big as the old one was stretched', () => {
      const s = setup();
      const a = add(s, 20, { x: 50, y: 50 });
      const first = box(s, a.inst);
      apply(s, scaleAbout(2, 2, 50, 50));
      redraw(s, a.inst, 20);
      const b = box(s, a.inst);
      expect(b.w).toBeCloseTo(first.w * 2, 3);
      expect(b.h).toBeCloseTo(first.h * 2, 3);
      // A bigger setting on top of the scale: twice the size of what the plugin draws at 30.
      redraw(s, a.inst, 30);
      const c = box(s, a.inst);
      expect(c.w / b.w).toBeGreaterThan(1.3);
      // Stroke widths come along (the plugin asked for 2, the shape is twice as big).
      expect(shapesOf(s).find((x) => x.stroke)!.stroke!.width).toBeCloseTo(4, 3);
    });

    it('keeps a turn and a flip, and keeps working after being redrawn once', () => {
      const s = setup();
      const a = add(s, 20, { x: 50, y: 50 });
      const first = shapesOf(s)[0].paths[0].points.map((p) => ({ x: p.x, y: p.y }));
      apply(s, rotateAbout(Math.PI / 2, 50, 50));
      redraw(s, a.inst, 20);
      const turned = shapesOf(s)[0].paths[0].points;
      // The same drawing, turned a quarter around (50, 50): (x, y) goes to (50 - (y - 50), 50 + (x - 50)).
      first.forEach((p, i) => {
        expect(turned[i].x).toBeCloseTo(50 - (p.y - 50), 3);
        expect(turned[i].y).toBeCloseTo(50 + (p.x - 50), 3);
      });
      apply(s, scaleAbout(-1, 1, 50, 50));
      redraw(s, a.inst, 20);
      redraw(s, a.inst, 20);
      const flipped = shapesOf(s)[0].paths[0].points;
      first.forEach((p, i) => {
        expect(flipped[i].x).toBeCloseTo(p.y, 3);
        expect(flipped[i].y).toBeCloseTo(p.x, 3);
      });
    });

    it('falls back to centring on the old drawing when the parts were edited point by point or have no record', () => {
      const s = setup();
      const a = add(s, 20, { x: 50, y: 50 });
      s.update('Cut a point', (d) => void (d.drawings.dv as { shapes: PathShape[] }).shapes[0].paths[0].points.pop());
      apply(s, [1, 0, 0, 1, 30, 0]);
      const was = box(s, a.inst);
      redraw(s, a.inst, 20);
      const b = box(s, a.inst);
      expect(b.x + b.w / 2).toBeCloseTo(was.x + was.w / 2, 3);
      expect(b.y + b.h / 2).toBeCloseTo(was.y + was.h / 2, 3);
      expect(infoOf(shapesOf(s)[0], 'star-kit')?.ref?.n).toBeGreaterThan(0);
    });
  });

  describe('finding the move again', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    it('picks far apart points and recovers any move, scale, turn, flip or slant exactly', () => {
      const ref = pickRef(pts);
      expect(ref.pts).toHaveLength(3);
      for (const m of [[1, 0, 0, 1, 5, -3], [2, 0, 0, 3, 1, 1], [0, 1, -1, 0, 4, 4], [-1, 0, 0, 1, 10, 0], [1, 0, 0.5, 1, 0, 0]] as const) {
        const now = pts.map((p) => ({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }));
        const got = refit(ref, now)!;
        m.forEach((v, i) => expect(got[i]).toBeCloseTo(v, 6));
      }
    });
    it('uses two points for a straight line and one for a dot, and gives up when the count changed', () => {
      const line = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 8, y: 0 }];
      expect(pickRef(line).pts).toHaveLength(2);
      const turned = line.map((p) => ({ x: -p.y, y: p.x }));
      expect(refit(pickRef(line), turned)!.map((v) => Math.abs(Math.round(v * 1e6) / 1e6))).toEqual([0, 1, 1, 0, 0, 0]);
      expect(pickRef([{ x: 3, y: 4 }]).pts).toEqual([[0, 3, 4]]);
      expect(refit(pickRef([{ x: 3, y: 4 }]), [{ x: 5, y: 5 }])).toEqual([1, 0, 0, 1, 2, 1]);
      expect(refit(pickRef(pts), pts.slice(1))).toBeNull();
      expect(pickRef([])).toEqual({ n: 0, pts: [] });
    });
  });

  it('shows a placeholder when the plugin drew nothing, so the shape can still be found and moved', () => {
    const s = setup();
    s.update('Add', (d) => void addPluginShape(d, { drawingId: 'dv', pluginId: 'star-kit', kind: 'star', props: {}, list: [], at: { x: 10, y: 10 } }));
    expect(shapesOf(s).length).toBe(2);
    expect(infoOf(shapesOf(s)[0], 'star-kit')?.placeholder).toBe(true);
  });

  it('needs a vector drawing', () => {
    const s = setup();
    expect(() => s.update('x', (d) => void addPluginShape(d, { drawingId: null, pluginId: 'p', kind: 'k', props: {}, list: star(5), at: { x: 0, y: 0 } }))).toThrow(/vector/);
  });

  it('a saved file opens, draws and saves again without the plugin, and keeps what the plugin needs', () => {
    const s = setup();
    const { inst } = add(s, 20);
    const bytes = saveFile(s.get().doc);
    // The reader knows nothing about plugins: the shapes come back as plain shapes with their ext bag.
    const { doc, warnings } = loadFile(bytes);
    expect(warnings).toEqual([]);
    const shapes = (doc.drawings.dv as { shapes: PathShape[] }).shapes;
    expect(shapes).toHaveLength(2);
    expect(shapes[0].fill).toBe('#ffcc00');
    expect(shapes[0].ext?.[extKeyOf('star-kit')]).toMatchObject({ kind: 'star', inst, props: { r: 20 } });
    expect(shapes.every((x) => x.group === `pg-${inst}`)).toBe(true);
    // And once more through the writer, unchanged.
    const again = loadFile(saveFile(doc)).doc;
    expect(JSON.stringify((again.drawings.dv as { shapes: PathShape[] }).shapes[0].ext)).toBe(JSON.stringify(shapes[0].ext));
    // With the plugin back, it can redraw from those settings.
    const s2 = new Store(doc);
    s2.update('Redraw', (d) => void redrawPluginShape(d, { pluginId: 'star-kit', kind: 'star', props: { r: 30 }, list: star(30), inst }));
    expect(findInst(s2.get().doc, 'star-kit', inst)).not.toBeNull();
  });

  it('finds which plugins a document uses, and says what is missing in plain words', () => {
    const s = setup();
    add(s, 10);
    const used = pluginsUsedBy(s.get().doc);
    expect([...used.keys()]).toEqual(['star-kit']);
    expect([...used.get('star-kit')!]).toEqual(['star']);
    expect(missingPluginNotes(used, [{ id: 'star-kit', name: 'Star kit', enabled: true }])).toEqual([]);
    expect(missingPluginNotes(used, [{ id: 'star-kit', name: 'Star kit', enabled: false }])[0]).toMatchObject({ installed: true, message: expect.stringMatching(/"Star kit" plugin, which is turned off/) });
    expect(missingPluginNotes(used, [])[0]).toMatchObject({ installed: false, message: expect.stringMatching(/isn't installed/) });
    expect(pluginsUsedBy(newDoc()).size).toBe(0);
  });
});
