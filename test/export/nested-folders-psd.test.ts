// Folders inside folders in a layered PSD: nested groups come out nested, with each level's own settings.
import { describe, expect, it } from 'vitest';
import { initializeCanvas, readPsd } from 'ag-psd';
import type { Layer } from '../../src/core/format';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import * as edit from '../../src/effects/edit';
import { bakedFolderDoc, layeredPlan, itemLayers, type LayeredItem } from '../../src/export/layered';
import { psdRecords } from '../../src/export/psd-layers';
import { writePsd } from '../../src/export/psd';
import type { RawImage } from '../../src/io/png';

initializeCanvas(
  () => {
    throw new Error('no canvas in tests');
  },
  (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: 'srgb' }) as ImageData,
);

const W = 4;
const H = 2;
const solid = (): RawImage => ({ width: W, height: H, pixels: new Uint8ClampedArray(W * H * 4).fill(255) });
const pics = { layer: () => solid(), folder: () => solid() };
const layer = (id: string, extra: Partial<Layer> = {}): Layer => Object.assign(newVectorLayer(id), { id }, extra) as Layer;

function read(items: LayeredItem[]) {
  const bytes = writePsd(W, H, psdRecords(items, pics), solid());
  return readPsd(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, { useImageData: true });
}
type Node = NonNullable<ReturnType<typeof read>['children']>[number];
/** The PSD tree as text: layers by name, groups as name(children), bottom first. */
const show = (nodes: Node[]): string => nodes.map((n) => (n.children ? `${n.name}(${show(n.children)})` : n.name)).join(' ');

function make() {
  const doc = newDoc({ width: W, height: H });
  doc.layers = [layer('a'), layer('b'), layer('c'), layer('d')];
  const p = edit.makeFolder(doc, ['b', 'c'], 'P')!;
  const q = edit.makeFolder(doc, ['c'], 'Q')!;
  return { doc, p, q };
}

describe('nested folders in a PSD', () => {
  it('writes a group inside a group, with each level opacity, blend and visibility', () => {
    const { doc, p, q } = make();
    doc.folders![p].opacity = 0.5;
    doc.folders![q].opacity = 0.25;
    doc.folders![q].blend = 'multiply';
    doc.folders![q].visible = false;
    const psd = read(layeredPlan(doc));
    expect(show(psd.children!)).toBe('a P(b Q(c)) d');
    const outer = psd.children![1];
    expect(outer.opacity).toBeCloseTo(0.5, 2);
    const inner = outer.children![1];
    expect(inner.name).toBe('Q');
    expect(inner.opacity).toBeCloseTo(0.25, 2);
    expect(inner.blendMode).toBe('multiply');
    expect(inner.hidden).toBe(true);
    // A faded folder is its own group, not a pass-through one.
    expect(outer.blendMode).toBe('normal');
  });

  it('a layer inside a hidden outer folder is hidden, and a plain nested folder passes through', () => {
    const { doc, p, q } = make();
    doc.folders![p].visible = false;
    const plan = layeredPlan(doc);
    const group = plan[1];
    if (group.kind !== 'group') throw new Error('no group');
    const inner = group.layers[1];
    if (inner.kind !== 'group') throw new Error('no inner group');
    expect(inner.passThrough).toBe(true);
    expect(inner.layers[0].kind === 'layer' && inner.layers[0].hidden).toBe(true);
    expect(itemLayers(plan).map((x) => x.layer.id)).toEqual(['a', 'b', 'c', 'd']);
    const psd = read(plan);
    expect(psd.children![1].hidden).toBe(true);
    expect(q).toBeTruthy();
  });

  it('a nested folder with effects is one picture with its layers kept hidden inside; the outer folder stays plain', () => {
    const { doc, q } = make();
    doc.folders![q].effects = [{ id: 'e', kind: 'blur', values: { radius: 2 } }];
    const plan = layeredPlan(doc);
    const seen: string[] = [];
    const bytes = writePsd(
      W,
      H,
      psdRecords(plan, { layer: () => solid(), folder: (f, members) => (seen.push(`${f.name}:${members.map((m) => m.id).join('')}`), solid()) }),
      solid(),
    );
    const psd = readPsd(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, { useImageData: true });
    expect(seen).toEqual(['Q:c']);
    expect(show(psd.children!)).toBe('a P(b Q(c Q (with effects))) d');
    const inner = psd.children![1].children![1];
    expect(inner.children![0].hidden).toBe(true);
  });

  it('a baked outer folder keeps its inner folder as a hidden group and draws all layers in its picture', () => {
    const { doc, p } = make();
    doc.folders![p].effects = [{ id: 'e', kind: 'blur', values: { radius: 2 } }];
    const seen: string[] = [];
    const bytes = writePsd(W, H, psdRecords(layeredPlan(doc), { layer: () => solid(), folder: (f, m) => (seen.push(`${f.name}:${m.map((x) => x.id).join('')}`), solid()) }), solid());
    const psd = readPsd(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, { useImageData: true });
    expect(seen).toEqual(['P:bc']);
    expect(show(psd.children!)).toBe('a P(b Q(c) P (with effects)) d');
    expect(psd.children![1].children![1].hidden).toBe(true);
  });

  it('a picture of a nested folder leaves out the fade, blend, effects and hiding of the folders around it', () => {
    const { doc, p, q } = make();
    doc.folders![p].opacity = 0.3;
    doc.folders![p].visible = false;
    doc.folders![p].effects = [{ id: 'e', kind: 'blur', values: { radius: 2 } }];
    doc.folders![q].effects = [{ id: 'f', kind: 'blur', values: { radius: 3 } }];
    doc.folders![q].opacity = 0.5;
    const b = bakedFolderDoc(doc, q);
    expect(b.folders![p]).toMatchObject({ visible: true, opacity: 1 });
    expect(b.folders![p].effects).toBeUndefined();
    expect(b.folders![q]).toMatchObject({ visible: true, opacity: 1 });
    expect(b.folders![q].effects).toHaveLength(1);
  });

  it('a stage mask over a folder containing a folder wraps the whole thing', () => {
    const { doc } = make();
    doc.layers.push(layer('m', { mask: 'show' }));
    const plan = layeredPlan(doc);
    expect(plan.map((i) => i.kind)).toEqual(['masked']);
    const psd = read(plan);
    expect(show(psd.children!)).toBe('Masked by m(a P(b Q(c)) d m (mask))');
  });
});
