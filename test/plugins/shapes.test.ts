// A plugin's own kind of shape: stored as ordinary shapes with its data in `ext`, so a file opens, draws and saves
// without the plugin.
import { describe, expect, it } from 'vitest';
import { newDoc, newVectorDrawing } from '../../src/core/doc';
import type { Doc, PathShape } from '../../src/core/format';
import { loadFile, saveFile } from '../../src/io/file';
import { shapesBounds } from '../../src/canvas/geometry';
import { Store } from '../../src/core/store';
import { sanitizeDrawList } from '../../src/plugins/drawlist';
import { missingPluginNotes } from '../../src/plugins/docPrompt';
import { addPluginShape, extKeyOf, findInst, infoOf, pluginsUsedBy, redrawPluginShape, ShapeProblem } from '../../src/plugins/shapes';

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
