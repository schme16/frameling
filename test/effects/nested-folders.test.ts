// Folders inside folders: the model, reading and saving, the editing moves, the compositing plan and the timeline rows.
import { describe, expect, it } from 'vitest';
import type { Doc } from '../../src/core/format';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { MAX_FOLDER_DEPTH, folderChain, folderLevel, layerShown, layerTree, type TreeNode } from '../../src/core/folders';
import * as edit from '../../src/effects/edit';
import { readFolders } from '../../src/effects/io';
import { buildPlan, planLayers, type PlanStep } from '../../src/effects/plan';
import { timelineRows } from '../../src/effects/rows';
import { loadFile, saveFile } from '../../src/io/file';

function docWith(names: string[]): Doc {
  const doc = newDoc({ width: 8, height: 8 });
  doc.layers = names.map((n) => Object.assign(newVectorLayer(n), { id: n }));
  return doc;
}
const order = (d: Doc) => d.layers.map((l) => l.id).join('');
const folderOfLayer = (d: Doc, id: string) => d.layers.find((l) => l.id === id)!.folder;
/** The tree as text: layers by id, folders as name(children), bottom first. */
function show(nodes: TreeNode[]): string {
  return nodes.map((n) => (n.type === 'layer' ? n.layer.id : `${n.folder.name}(${show(n.children)})`)).join(' ');
}
/** Layers a, b, c, d (bottom first) with folder P holding b and c, and Q (inside P) holding c. */
function nested(): { doc: Doc; p: string; q: string } {
  const doc = docWith(['a', 'b', 'c', 'd']);
  const p = edit.makeFolder(doc, ['b', 'c'], 'P')!;
  const q = edit.makeFolder(doc, ['c'], 'Q')!;
  return { doc, p, q };
}

describe('nested folders: the model', () => {
  it('a folder made from a layer inside a folder sits inside that folder', () => {
    const { doc, p, q } = nested();
    expect(doc.folders![q].parent).toBe(p);
    expect(doc.folders![p].parent).toBeUndefined();
    expect(folderOfLayer(doc, 'c')).toBe(q);
    expect(show(layerTree(doc))).toBe('a P(b Q(c)) d');
    expect(folderChain(doc.folders, q).map((f) => f.name)).toEqual(['P', 'Q']);
    expect(folderLevel(doc, q)).toBe(2);
  });

  it('hiding an outer folder hides the layers in the folders inside it', () => {
    const { doc, p } = nested();
    expect(layerShown(doc, doc.layers[2])).toBe(true);
    doc.folders![p].visible = false;
    expect(layerShown(doc, doc.layers[2])).toBe(false);
    expect(layerShown(doc, doc.layers[0])).toBe(true);
  });

  it('a folder whose layers are split up becomes a copy per run', () => {
    const doc = docWith(['a', 'b', 'c']);
    doc.folders = { f: { id: 'f', name: 'F', visible: true, opacity: 1 } };
    doc.layers[0].folder = 'f';
    doc.layers[2].folder = 'f';
    expect(show(layerTree(doc))).toBe('F(a) b F(c)');
  });

  it('survives a loop, a missing parent and a parent pointing at itself in the tree helpers', () => {
    const folders = { x: { id: 'x', name: 'X', visible: true, opacity: 1, parent: 'y' }, y: { id: 'y', name: 'Y', visible: true, opacity: 1, parent: 'x' } };
    expect(folderChain(folders, 'x').length).toBe(2);
    expect(folderChain(folders, 'gone')).toEqual([]);
  });
});

describe('nested folders: files', () => {
  it('round-trips and keeps the nesting', () => {
    const { doc, p, q } = nested();
    doc.folders![q].opacity = 0.5;
    const back = loadFile(saveFile(doc)).doc;
    expect(back.folders![q]).toMatchObject({ parent: p, opacity: 0.5 });
    expect(show(layerTree(back))).toBe('a P(b Q(c)) d');
  });

  it('opens files from before nesting unchanged', () => {
    const doc = docWith(['a', 'b']);
    const f = edit.makeFolder(doc, ['b'])!;
    const back = loadFile(saveFile(doc)).doc;
    expect(back.folders![f].parent).toBeUndefined();
    expect(Object.keys(back.folders![f])).not.toContain('parent');
  });

  it('keeps a folder that holds only another folder, and drops empty ones', () => {
    const layers = [Object.assign(newVectorLayer('x'), { folder: 'in' })];
    const raw = { out: { name: 'Out' }, in: { name: 'In', parent: 'out' }, empty: { name: 'E', parent: 'out' }, lonely: { name: 'L' } };
    const { folders } = readFolders(raw, layers);
    expect(Object.keys(folders!).sort()).toEqual(['in', 'out']);
    expect(folders!.in.parent).toBe('out');
  });

  it('repairs a loop, a self parent, a missing parent and a chain deeper than the cap', () => {
    const layers = [Object.assign(newVectorLayer('x'), { folder: 'a' }), Object.assign(newVectorLayer('y'), { folder: 'self' }), Object.assign(newVectorLayer('z'), { folder: 'n0' })];
    const raw: Record<string, unknown> = { a: { name: 'A', parent: 'b' }, b: { name: 'B', parent: 'a' }, self: { name: 'S', parent: 'self' } };
    for (let i = 0; i < 12; i++) raw[`n${i}`] = { name: `N${i}`, ...(i < 11 ? { parent: `n${i + 1}` } : { parent: 'nowhere' }) };
    layers[2].folder = 'n0';
    const { folders } = readFolders(raw, layers);
    // The loop is cut, so the chain from A ends.
    expect(folderChain(folders, 'a').length).toBeLessThanOrEqual(2);
    expect(folders!.self.parent).toBeUndefined();
    expect(folderChain(folders, 'n0').length).toBeLessThanOrEqual(MAX_FOLDER_DEPTH);
    for (const f of Object.values(folders!)) expect(f.parent === undefined || !!folders![f.parent]).toBe(true);
  });
});

describe('nested folders: editing', () => {
  it('drags a folder into another folder, and out again', () => {
    const doc = docWith(['a', 'b', 'c', 'd']);
    const f = edit.makeFolder(doc, ['a', 'b'], 'F')!;
    const g = edit.makeFolder(doc, ['c', 'd'], 'G')!;
    expect(edit.moveNode(doc, { folder: g }, { folder: f }, 'into')).toBe(true);
    expect(doc.folders![g].parent).toBe(f);
    expect(show(layerTree(doc))).toBe('F(a b G(c d))');
    // A folder can't go inside itself or its own insides.
    expect(edit.moveNode(doc, { folder: f }, { folder: g }, 'into')).toBe(false);
    expect(edit.moveNode(doc, { folder: g }, { folder: g }, 'above')).toBe(false);
    // Out: dropped above a layer outside.
    doc.layers.push(Object.assign(newVectorLayer('e'), { id: 'e' }));
    expect(edit.moveNode(doc, { folder: g }, { layer: 'e' }, 'above')).toBe(true);
    expect(doc.folders![g].parent).toBeUndefined();
    expect(show(layerTree(doc))).toBe('F(a b) e G(c d)');
  });

  it('moves a whole folder next to a layer, keeping its insides together', () => {
    const { doc, p } = nested();
    expect(edit.moveNode(doc, { folder: p }, { layer: 'd' }, 'above')).toBe(true);
    expect(order(doc)).toBe('adbc');
    expect(show(layerTree(doc))).toBe('a d P(b Q(c))');
  });

  it('a layer dropped next to one inside a nested folder joins that nested folder', () => {
    const { doc, q } = nested();
    expect(edit.moveNode(doc, { layer: 'd' }, { layer: 'c' }, 'below')).toBe(true);
    expect(folderOfLayer(doc, 'd')).toBe(q);
    expect(order(doc)).toBe('abdc');
  });

  it('refuses to go deeper than the cap', () => {
    const doc = docWith(['a', 'b']);
    let prev: string | undefined;
    for (let i = 0; i < MAX_FOLDER_DEPTH; i++) {
      const id = edit.makeFolder(doc, ['a'], `L${i}`)!;
      expect(id).toBeTruthy();
      prev = id;
    }
    expect(folderLevel(doc, prev!)).toBeLessThanOrEqual(MAX_FOLDER_DEPTH);
    // The deepest folder holds a; a folder of b can't be put inside it.
    const h = edit.makeFolder(doc, ['b'], 'H')!;
    expect(edit.moveNode(doc, { folder: h }, { folder: prev! }, 'into')).toBe(false);
    // And a folder made from a layer at the deepest level goes beside, not deeper.
    const more = edit.makeFolder(doc, ['a'], 'Extra')!;
    expect(folderLevel(doc, more)).toBeLessThanOrEqual(MAX_FOLDER_DEPTH);
  });

  it('arrow-key steps go into and out of folders one level at a time', () => {
    const doc = docWith(['a', 'b', 'c']);
    const p = edit.makeFolder(doc, ['b'], 'P')!;
    const q = edit.makeFolder(doc, ['c'], 'Q')!;
    // Put Q inside P (c sits above b): P(b Q(c)).
    edit.moveNode(doc, { folder: q }, { folder: p }, 'into');
    expect(show(layerTree(doc))).toBe('a P(b Q(c))');
    // a steps up: into P first, then past b, into Q, past c, out of Q, out of P.
    const steps = ['P(a b Q(c))', 'P(b a Q(c))', 'P(b Q(a c))', 'P(b Q(c a))', 'P(b Q(c) a)', 'P(b Q(c)) a'];
    for (const want of steps) {
      expect(edit.stepLayerThroughFolders(doc, 'a', 'up')).toBe(true);
      expect(show(layerTree(doc))).toBe(want);
    }
  });

  it('nest and unnest keep layers in one piece', () => {
    const doc = docWith(['a', 'b', 'c']);
    const p = edit.makeFolder(doc, ['b', 'c'], 'P')!;
    // a is below P: nesting puts it in at P's bottom... P is above a, so it goes to the folder above.
    expect(edit.nestNode(doc, { layer: 'a' })).toBe(true);
    expect(folderOfLayer(doc, 'a')).toBe(p);
    expect(order(doc)).toBe('abc');
    expect(edit.outdentNode(doc, { layer: 'a' })).toBe(true);
    expect(folderOfLayer(doc, 'a')).toBeUndefined();
    expect(order(doc)).toBe('bca');
    expect(edit.outdentNode(doc, { layer: 'a' })).toBe(false);
  });

  it('moving a folder with the arrows hops over its neighbour, and out at the edge', () => {
    const doc = docWith(['a', 'b', 'c', 'd']);
    const f = edit.makeFolder(doc, ['b', 'c'], 'F')!;
    expect(edit.stepNode(doc, { folder: f }, 'up')).toBe(true);
    expect(order(doc)).toBe('adbc');
    expect(edit.stepNode(doc, { folder: f }, 'down')).toBe(true);
    expect(order(doc)).toBe('abcd');
    const g = edit.makeFolder(doc, ['a'], 'G')!;
    expect(edit.nestNode(doc, { folder: g })).toBe(true);
    expect(doc.folders![g].parent).toBe(f);
    expect(edit.outdentNode(doc, { folder: g })).toBe(true);
    expect(doc.folders![g].parent).toBeUndefined();
  });

  it('ungrouping hands the layers and inner folders to the folder around it', () => {
    const { doc, p, q } = nested();
    expect(edit.ungroupFolder(doc, p)).toBe(true);
    expect(doc.folders![p]).toBeUndefined();
    expect(doc.folders![q].parent).toBeUndefined();
    expect(folderOfLayer(doc, 'b')).toBeUndefined();
    expect(folderOfLayer(doc, 'c')).toBe(q);
    const again = nested();
    edit.ungroupFolder(again.doc, again.q);
    expect(folderOfLayer(again.doc, 'c')).toBe(again.p);
  });

  it('a folder vanishes with its last layer, and an outer folder with only an inner one stays', () => {
    const { doc, p, q } = nested();
    edit.moveLayerInto(doc, 'b', 0, null);
    expect(doc.folders![p]).toBeDefined();
    edit.moveLayerInto(doc, 'c', 0, null);
    expect(doc.folders).toBeUndefined();
    expect(q).toBeTruthy();
  });

  it('a plain reorder that would split a nested folder keeps it whole', () => {
    const { doc, p } = nested();
    const q = folderOfLayer(doc, 'c')!;
    // Put a layer from outside between b and c, in the middle of P: it joins P.
    const [d] = doc.layers.splice(3, 1);
    doc.layers.splice(2, 0, d);
    edit.tidyFolders(doc, 'd');
    expect(folderOfLayer(doc, 'd')).toBe(p);
    expect(folderOfLayer(doc, 'c')).toBe(q);
  });
});

describe('nested folders: the compositing plan', () => {
  const nodeOf = (s: PlanStep) => (s.type === 'draw' ? s.node : null);

  it('plans a folder inside a folder, each with its own look', () => {
    const { doc, p, q } = nested();
    doc.folders![p].opacity = 0.5;
    doc.folders![q].blend = 'multiply';
    const plan = buildPlan(doc, (l) => l.visible);
    const outer = nodeOf(plan[1]);
    expect(outer?.type === 'folder' && outer.folder.id === p).toBe(true);
    if (outer?.type !== 'folder') throw new Error('no folder');
    expect(outer.isolate).toBe(true);
    const inner = nodeOf(outer.steps[1]);
    expect(inner?.type === 'folder' && inner.folder.id === q && inner.isolate).toBe(true);
    expect(planLayers(plan).map((l) => l.id).join('')).toBe('abcd');
  });

  it('a folded plain folder inside a plain folder passes straight through', () => {
    const { doc } = nested();
    const plan = buildPlan(doc, (l) => l.visible);
    const outer = nodeOf(plan[1]);
    expect(outer?.type === 'folder' && outer.isolate).toBe(false);
  });

  it('hiding the outer folder, or the inner one, hides what is in it', () => {
    const { doc, p, q } = nested();
    doc.folders![q].visible = false;
    expect(planLayers(buildPlan(doc, (l) => l.visible)).map((l) => l.id).join('')).toBe('abd');
    doc.folders![q].visible = true;
    doc.folders![p].visible = false;
    expect(planLayers(buildPlan(doc, (l) => l.visible)).map((l) => l.id).join('')).toBe('ad');
    expect(planLayers(buildPlan(doc, (l) => l.visible, true)).map((l) => l.id).join('')).toBe('abcd');
  });

  it('a mask inside an inner folder cuts only that folder', () => {
    const { doc, q } = nested();
    doc.layers.splice(3, 0, Object.assign(newVectorLayer('m'), { id: 'm', mask: 'show' as const, folder: q }));
    const plan = buildPlan(doc, (l) => l.visible);
    const outer = nodeOf(plan[1]);
    if (outer?.type !== 'folder') throw new Error('no folder');
    expect(outer.isolate).toBe(false);
    const inner = nodeOf(outer.steps[1]);
    expect(inner?.type === 'folder' && inner.isolate && inner.steps.map((s) => s.type)).toEqual(['draw', 'mask']);
  });
});

describe('nested folders: the timeline rows', () => {
  it('lists a folder inside a folder with its depth, and folds it away with its parent', () => {
    const { doc, p, q } = nested();
    const rows = timelineRows(doc, new Set());
    expect(rows.map((r) => (r.type === 'folder' ? `F${r.depth}` : `${r.layer.id}${r.depth}`))).toEqual(['d0', 'F0', 'F1', 'c2', 'b1', 'a0']);
    const inner = rows[2];
    expect(inner.type === 'folder' && inner.layerIds).toEqual(['c']);
    const outer = rows[1];
    expect(outer.type === 'folder' && outer.layerIds).toEqual(['c', 'b']);
    expect(timelineRows(doc, new Set([q])).map((r) => (r.type === 'folder' ? 'F' : r.layer.id))).toEqual(['d', 'F', 'F', 'b', 'a']);
    expect(timelineRows(doc, new Set([p])).map((r) => (r.type === 'folder' ? 'F' : r.layer.id))).toEqual(['d', 'F', 'a']);
  });
});
