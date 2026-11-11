import { describe, expect, it } from 'vitest';
import { initializeCanvas, readPsd } from 'ag-psd';
import type { Layer } from '../../src/core/format';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { bakedFolderDoc, layeredPlan, soloDoc, type LayeredItem } from '../../src/export/layered';
import { maskPixels, psdRecords } from '../../src/export/psd-layers';
import { writePsd } from '../../src/export/psd';
import type { RawImage } from '../../src/io/png';

initializeCanvas(
  () => {
    throw new Error('no canvas in tests');
  },
  (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: 'srgb' }) as ImageData,
);

const W = 8;
const H = 4;

/** A picture with `rgba` wherever `inside(x)` holds. */
function img(inside: (x: number, y: number) => boolean, rgba: [number, number, number, number]): RawImage {
  const pixels = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y)) pixels.set(rgba, (y * W + x) * 4);
  return { width: W, height: H, pixels };
}

const layer = (id: string, extra: Partial<Layer> = {}): Layer => Object.assign(newVectorLayer(id), { id }, extra) as Layer;

// A stand-in for the renderer: each layer is a column of a colour, so results can be checked by eye.
const COLUMNS: Record<string, { x0: number; x1: number; c: [number, number, number, number] }> = {
  A: { x0: 0, x1: 8, c: [255, 0, 0, 255] },
  B: { x0: 0, x1: 4, c: [0, 0, 255, 255] },
  M: { x0: 4, x1: 8, c: [0, 0, 0, 255] },
  C: { x0: 0, x1: 2, c: [0, 255, 0, 255] },
  D: { x0: 6, x1: 8, c: [255, 255, 0, 255] },
};
const pics = {
  layer: (l: Layer) => {
    const k = COLUMNS[l.id];
    return img((x) => x >= k.x0 && x < k.x1, k.c);
  },
  folder: (f: { id: string }, members: Layer[]) => img((x) => x < 8, members.length ? [9, 9, 9, 255] : [0, 0, 0, 0]),
};

function read(items: LayeredItem[]) {
  const bytes = writePsd(W, H, psdRecords(items, pics), img(() => true, [0, 0, 0, 255]));
  return readPsd(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, { useImageData: true });
}

describe('stage masks in a PSD', () => {
  it('wraps everything under a visible mask in a group that takes the mask', () => {
    const doc = newDoc({ width: W, height: H });
    doc.layers = [layer('A'), layer('B'), layer('M', { mask: 'show' }), layer('D')];
    const plan = layeredPlan(doc);
    expect(plan.map((i) => i.kind)).toEqual(['masked', 'layer']);
    const m = plan[0];
    if (m.kind !== 'masked') throw new Error('not masked');
    expect(m.layers.map((i) => (i.kind === 'layer' ? [i.layer.id, i.hidden] : '?'))).toEqual([['A', false], ['B', false], ['M', true]]);

    const psd = read(plan);
    const [group, d] = psd.children!;
    expect(d.name).toBe('D');
    expect(group.children!.map((c) => c.name)).toEqual(['A', 'B', 'M (mask)']);
    expect(group.children![2].hidden).toBe(true);
    // An isolated group, so blend modes inside work against each other like on the canvas, not against the page.
    expect(group.blendMode).toBe('normal');
    expect(group.mask).toBeTruthy();
    expect(group.mask!.left).toBe(0);
    expect(group.mask!.right).toBe(W);
    const md = group.mask!.imageData!.data;
    // 'show': inside the mask's drawing (columns 4 to 7) the layers show.
    const per = md.length / (W * H);
    expect(md[0 * per]).toBe(0);
    expect(md[5 * per]).toBe(255);
  });

  it("'hide' masks invert, hidden masks do nothing, and later masks wrap the earlier group", () => {
    const hide = img((x) => x >= 4, [0, 0, 0, 255]);
    expect(Array.from(maskPixels(hide, true).slice(0, 8))).toEqual([255, 255, 255, 255, 0, 0, 0, 0]);
    expect(Array.from(maskPixels(hide, false).slice(0, 8))).toEqual([0, 0, 0, 0, 255, 255, 255, 255]);

    const doc = newDoc({ width: W, height: H });
    doc.layers = [layer('A'), layer('M', { mask: 'show', visible: false }), layer('B'), layer('C', { mask: 'hide' }), layer('D')];
    const plan = layeredPlan(doc);
    // The hidden mask stays a hidden layer; the visible one wraps what's under it, A, the hidden mask and B.
    expect(plan.map((i) => i.kind)).toEqual(['masked', 'layer']);
    const outer = plan[0];
    if (outer.kind !== 'masked') throw new Error();
    expect(outer.mask.id).toBe('C');
    expect(outer.layers.map((i) => (i.kind === 'layer' ? i.layer.id : 'group'))).toEqual(['A', 'M', 'B', 'C']);

    doc.layers = [layer('A'), layer('M', { mask: 'show' }), layer('B'), layer('C', { mask: 'hide' }), layer('D')];
    const nested = layeredPlan(doc);
    expect(nested.map((i) => i.kind)).toEqual(['masked', 'layer']);
    const top = nested[0];
    if (top.kind !== 'masked') throw new Error();
    expect(top.layers.map((i) => i.kind)).toEqual(['masked', 'layer', 'layer']);
    const psd = read(nested);
    const g = psd.children![0];
    expect(g.name).toBe('Masked by C');
    expect(g.children![0].name).toBe('Masked by M');
    expect(g.children![0].children!.map((c) => c.name)).toEqual(['A', 'M (mask)']);
  });

  it('a mask with nothing under it stays a hidden layer, and the layer right after a mask is not clipped', () => {
    const doc = newDoc({ width: W, height: H });
    doc.layers = [layer('M', { mask: 'show' }), layer('C', { clipToBelow: true })];
    const plan = layeredPlan(doc);
    expect(plan.map((i) => i.kind)).toEqual(['layer', 'layer']);
    expect(plan[0].kind === 'layer' && plan[0].hidden).toBe(true);
    expect(plan[1].kind === 'layer' && plan[1].clipping).toBe(false);
  });

  it('composites to the same picture as drawing the plan on the canvas', () => {
    // A tiny normal-blend compositor over the PSD read back, against the same thing worked out by hand.
    const doc = newDoc({ width: W, height: H });
    doc.layers = [layer('A'), layer('B'), layer('M', { mask: 'show' }), layer('D')];
    const psd = read(layeredPlan(doc));
    type Px = [number, number, number, number];
    const blank = (): Px[] => Array.from({ length: W * H }, () => [0, 0, 0, 0] as Px);
    const over = (dst: Px[], src: Px[]) => {
      for (let i = 0; i < dst.length; i++) if (src[i][3] === 255) dst[i] = src[i];
    };
    const draw = (node: NonNullable<typeof psd.children>[number]): Px[] => {
      if (node.children) {
        const buf = blank();
        for (const c of node.children) if (!c.hidden) over(buf, draw(c));
        if (node.mask) {
          const md = node.mask.imageData!.data;
          const per = md.length / (W * H);
          for (let i = 0; i < buf.length; i++) if (md[i * per] === 0) buf[i] = [0, 0, 0, 0];
        }
        return buf;
      }
      const out = blank();
      const d = node.imageData;
      if (!d) return out;
      for (let y = 0; y < d.height; y++)
        for (let x = 0; x < d.width; x++) {
          const o = (y * d.width + x) * 4;
          out[(y + node.top!) * W + x + node.left!] = [d.data[o], d.data[o + 1], d.data[o + 2], d.data[o + 3]];
        }
      return out;
    };
    const total = blank();
    for (const c of psd.children!) if (!c.hidden) over(total, draw(c));
    const row = total.slice(0, W).map((p) => (p[3] ? `${p[0]},${p[1]},${p[2]}` : '-'));
    // A is red across, B is blue over columns 0 to 3, the mask keeps columns 4 to 7 of that, D is yellow on 6 and 7.
    expect(row).toEqual(['-', '-', '-', '-', '255,0,0', '255,0,0', '255,255,0', '255,255,0']);
  });
});

describe('masks inside a folder in a PSD', () => {
  const doc = () => {
    const d = newDoc({ width: W, height: H });
    d.folders = { f: { id: 'f', name: 'Head', visible: true, opacity: 1 } };
    // A under the folder; in it B, a mask M (right half), then C above the mask; D on the stage above.
    d.layers = [layer('A'), layer('B', { folder: 'f' }), layer('M', { mask: 'show', folder: 'f' }), layer('C', { folder: 'f' }), layer('D')];
    return d;
  };

  it('wraps only the layers under the mask, inside the folder', () => {
    const g = layeredPlan(doc())[1];
    if (g.kind !== 'group') throw new Error();
    expect(g.layers.map((i) => i.kind)).toEqual(['masked', 'layer']);
    const psd = read(layeredPlan(doc()));
    // The folder group itself takes no mask.
    const head = psd.children![1];
    expect(head.name).toBe('Head');
    expect(head.mask).toBeUndefined();
    expect(head.children!.map((c) => c.name)).toEqual(['Masked by M', 'C']);
    const masked = head.children![0];
    expect(masked.children!.map((c) => c.name)).toEqual(['B', 'M (mask)']);
    expect(masked.mask).toBeTruthy();
    const md = masked.mask!.imageData!.data;
    const per = md.length / (W * H);
    expect(Array.from({ length: W }, (_, x) => (md[x * per] === 0 ? 0 : 255))).toEqual([0, 0, 0, 0, 255, 255, 255, 255]);
    // The layers outside the mask carry nothing of it.
    expect(head.children![1].mask).toBeUndefined();
    expect(psd.children![0].mask).toBeUndefined();
    expect(psd.children![2].mask).toBeUndefined();
  });

  it('a mask at the bottom of a folder has nothing to cut and stays a hidden layer', () => {
    const d = doc();
    d.layers = [layer('M', { mask: 'show', folder: 'f' }), layer('C', { folder: 'f' })];
    const g = layeredPlan(d)[0];
    if (g.kind !== 'group') throw new Error();
    expect(g.layers.map((i) => i.kind)).toEqual(['layer', 'layer']);
    const head = read(layeredPlan(d)).children![0];
    expect(head.mask).toBeUndefined();
    expect(head.children!.map((c) => [c.name, !!c.hidden])).toEqual([['M (mask)', true], ['C', false]]);
  });

  it('a hidden mask in a folder does nothing', () => {
    const d = doc();
    d.layers = [layer('B', { folder: 'f' }), layer('M', { mask: 'show', visible: false, folder: 'f' }), layer('C', { folder: 'f' })];
    const g = layeredPlan(d)[0];
    if (g.kind !== 'group') throw new Error();
    expect(g.layers.map((i) => i.kind)).toEqual(['layer', 'layer', 'layer']);
  });

  it('composites like the canvas: B is cut to the mask, C above it is whole', () => {
    const psd = read(layeredPlan(doc()));
    type Px = [number, number, number, number];
    const blank = (): Px[] => Array.from({ length: W * H }, () => [0, 0, 0, 0] as Px);
    const over = (dst: Px[], src: Px[]) => {
      for (let i = 0; i < dst.length; i++) if (src[i][3] === 255) dst[i] = src[i];
    };
    const draw = (node: NonNullable<typeof psd.children>[number]): Px[] => {
      const out = blank();
      if (node.children) {
        for (const c of node.children) if (!c.hidden) over(out, draw(c));
        if (node.mask) {
          const md = node.mask.imageData!.data;
          const per = md.length / (W * H);
          for (let i = 0; i < out.length; i++) if (md[i * per] === 0) out[i] = [0, 0, 0, 0];
        }
        return out;
      }
      const d = node.imageData;
      if (!d) return out;
      for (let y = 0; y < d.height; y++)
        for (let x = 0; x < d.width; x++) {
          const o = (y * d.width + x) * 4;
          out[(y + node.top!) * W + x + node.left!] = [d.data[o], d.data[o + 1], d.data[o + 2], d.data[o + 3]];
        }
      return out;
    };
    // Only the folder's own content: B (blue, columns 0 to 3) masked to columns 4 to 7 leaves nothing; C is green on 0 and 1.
    const head = draw(psd.children![1]);
    const row = head.slice(0, W).map((p) => (p[3] ? `${p[0]},${p[1]},${p[2]}` : '-'));
    expect(row).toEqual(['0,255,0', '0,255,0', '-', '-', '-', '-', '-', '-']);
    // A stays whole underneath.
    const a = draw(psd.children![0]);
    expect(a.slice(0, W).every((p) => p[3] === 255)).toBe(true);
  });
});

describe('folder effects in a PSD', () => {
  const doc = () => {
    const d = newDoc({ width: W, height: H });
    d.folders = { f: { id: 'f', name: 'Head', visible: true, opacity: 0.6, blend: 'multiply', effects: [{ id: 'e', kind: 'glow', values: { strength: 1 } } as never] } };
    d.layers = [layer('A'), layer('B', { folder: 'f' }), layer('C', { folder: 'f' })];
    return d;
  };

  it('flags a folder with effects as baked, and a plain one not', () => {
    const d = doc();
    const g = layeredPlan(d)[1];
    expect(g.kind === 'group' && g.baked).toBe(true);
    d.folders!.f.effects = [];
    const g2 = layeredPlan(d)[1];
    expect(g2.kind === 'group' && g2.baked).toBe(false);
  });

  it('makes the group hold one finished picture, with the layers inside hidden', () => {
    const psd = read(layeredPlan(doc()));
    const group = psd.children![1];
    expect(group.name).toBe('Head');
    // The group keeps the folder's own opacity and blend as settings; the picture inside is at full strength.
    expect(group.opacity).toBeCloseTo(0.6, 2);
    expect(group.blendMode).toBe('multiply');
    expect(group.children!.map((c) => [c.name, !!c.hidden])).toEqual([
      ['B', true],
      ['C', true],
      ['Head (with effects)', false],
    ]);
    const baked = group.children![2];
    expect(baked.opacity).toBe(1);
    expect(baked.blendMode).toBe('normal');
    expect(baked.imageData!.data[0]).toBe(9);
    // Masks are already in the picture, so the group doesn't take one a second time.
    expect(group.mask).toBeUndefined();
  });

  it('draws the folder picture without its own opacity, blend or switch', () => {
    const d = doc();
    d.folders!.f.visible = false;
    const b = bakedFolderDoc(d, 'f');
    expect(b.folders!.f).toMatchObject({ visible: true, opacity: 1, blend: undefined });
    expect(b.folders!.f.effects).toHaveLength(1);
    // The document itself is left as it was.
    expect(d.folders!.f).toMatchObject({ visible: false, opacity: 0.6, blend: 'multiply' });
  });

  it('keeps a mask layer inside a baked folder working through the picture, not the group', () => {
    const d = doc();
    d.layers.push(layer('M', { mask: 'show', folder: 'f' }));
    const g = layeredPlan(d)[1];
    if (g.kind !== 'group') throw new Error();
    expect(g.baked).toBe(true);
    expect(g.masks).toHaveLength(1);
    const psd = read(layeredPlan(d));
    expect(psd.children![1].mask).toBeUndefined();
    expect(psd.children![1].children!.map((c) => c.name)).toEqual(['B', 'C', 'M (mask)', 'Head (with effects)']);
  });
});

describe('a layer on its own', () => {
  it('keeps the camera and the bones it is attached to, and nothing else', () => {
    const d = newDoc({ width: W, height: H });
    const rig = layer('R');
    const other = layer('X');
    const arm = layer('A', { bind: { rig: 'R', bone: 'b' }, opacity: 0.5, blend: 'multiply', mask: 'show' });
    d.layers = [other, rig, arm];
    const s = soloDoc(d, arm);
    expect(s.layers.map((l) => l.id)).toEqual(['R', 'A']);
    const solo = s.layers[1];
    expect(solo).toMatchObject({ opacity: 1, blend: undefined, mask: undefined, visible: true });
    expect(solo.bind).toEqual({ rig: 'R', bone: 'b' });
    // The original is left as it was.
    expect(arm.opacity).toBe(0.5);
  });
});
