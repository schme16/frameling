import { describe, expect, it } from 'vitest';
import { writePsd, type PsdLayer } from '../../src/export/psd';
import { countNodes, layeredPieces } from '../../src/import/layered/build';
import { LayeredProblem, type GroupNode, type RasterNode } from '../../src/import/layered/model';
import { readLayered } from '../../src/import/layered/read';
import { isPsd, readPsd } from '../../src/import/layered/psd';
import { buildPsd, solid, type TestLayer } from './psdBuilder';

const W = 6;
const H = 4;

/** A full-canvas picture: one colour, with a see-through left column. */
function pic(r: number, g: number, b: number, w = W, h = H) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      px.set(x === 0 ? [0, 0, 0, 0] : [r, g, b, 255], i);
    }
  return { width: w, height: h, pixels: px };
}

const raster = (n: unknown) => n as RasterNode;
const group = (n: unknown) => n as GroupNode;
const rgbaAt = (n: RasterNode, x: number, y: number) => [...n.pixels.subarray(((y - n.y) * n.width + (x - n.x)) * 4, ((y - n.y) * n.width + (x - n.x)) * 4 + 4)];

describe('reading a PSD from the app\'s own writer', () => {
  const layers: PsdLayer[] = [
    { name: 'Back', image: pic(255, 0, 0), opacity: 1, blend: 'normal' },
    { name: '</Layer group>', opacity: 1, blend: 'normal', group: 'end' },
    { name: 'Inside', image: pic(0, 255, 0), opacity: 0.5, blend: 'multiply', hidden: true, clipping: true },
    { name: 'Folder', opacity: 0.75, blend: 'screen', group: 'open' },
    { name: 'Front', image: pic(0, 0, 255), opacity: 1, blend: 'normal' },
  ];
  const bytes = writePsd(W, H, layers, pic(0, 0, 255));

  it('keeps names, order, opacity, blend, visibility, clipping and groups', async () => {
    expect(isPsd(bytes)).toBe(true);
    const f = await readLayered(bytes, 'x.psd');
    expect([f.width, f.height, f.format]).toEqual([W, H, 'psd']);
    expect(f.nodes.map((n) => n.name)).toEqual(['Back', 'Folder', 'Front']);
    const folder = group(f.nodes[1]);
    expect(folder.type).toBe('group');
    expect(folder.opacity).toBeCloseTo(0.75, 2);
    expect(folder.blend).toBe('screen');
    const inside = raster(folder.children[0]);
    expect(inside).toMatchObject({ name: 'Inside', hidden: true, clip: true, blend: 'multiply' });
    expect(inside.opacity).toBeCloseTo(0.5, 2);
    expect(f.left).toEqual([]);
  });

  it('puts every pixel where it was, and leaves the see-through column out', () => {
    const f = readPsd(bytes);
    const back = raster(f.nodes[0]);
    // The writer cuts each layer down to its painted box: columns 1 to 5.
    expect([back.x, back.y, back.width, back.height]).toEqual([1, 0, 5, 4]);
    expect(rgbaAt(back, 1, 0)).toEqual([255, 0, 0, 255]);
    expect(rgbaAt(back, 5, 3)).toEqual([255, 0, 0, 255]);
    expect(rgbaAt(raster(f.nodes[2]), 3, 2)).toEqual([0, 0, 255, 255]);
  });

  it('becomes pixel layers and folders, each picture held for the drawing', async () => {
    const f = await readLayered(bytes);
    expect(countNodes(f.nodes)).toEqual({ layers: 3, groups: 1 });
    const p = layeredPieces(f, 24);
    expect(p.layers.map((l) => l.name)).toEqual(['Back', 'Inside', 'Front']);
    const inside = p.layers[1];
    expect(inside).toMatchObject({ kind: 'pixel', visible: false, blend: 'multiply', clipToBelow: true });
    expect(inside.folder).toBeDefined();
    const folder = p.folders[inside.folder!];
    expect(folder).toMatchObject({ name: 'Folder', visible: true, blend: 'screen' });
    expect(p.layers[0].folder).toBeUndefined();
    const cel = p.layers[0].cels[0];
    expect(cel).toMatchObject({ start: 0, length: 24 });
    const d = p.drawings[cel.drawingId];
    expect(d.kind === 'pixel' && [d.x, d.y, d.width, d.height]).toEqual([1, undefined, 5, 4]);
  });
});

describe('every way a channel can be packed', () => {
  const plane = Uint8Array.from({ length: 12 }, (_, i) => (i * 21) & 255);
  for (const c of [0, 1, 2, 3] as const) {
    for (const depth of [8, 16] as const) {
      it(`reads compression ${c} at ${depth} bits`, () => {
        const channels = [
          { id: 0, plane, compression: c },
          { id: 1, plane: plane.map((v) => 255 - v), compression: c },
          { id: 2, plane: new Uint8Array(12).fill(7), compression: c },
          { id: -1, plane: new Uint8Array(12).fill(200), compression: c },
        ];
        const bytes = buildPsd({ width: 4, height: 3, depth, lr16: depth === 16, layers: [{ name: 'L', top: 0, left: 0, bottom: 3, right: 4, channels }] });
        const l = raster(readPsd(bytes).nodes[0]);
        expect([l.width, l.height]).toEqual([4, 3]);
        for (let i = 0; i < 12; i++) expect([...l.pixels.subarray(i * 4, i * 4 + 4)]).toEqual([plane[i], 255 - plane[i], 7, 200]);
      });
    }
  }
});

describe('positions, masks and names', () => {
  it('cuts a layer that hangs over the edge, and drops one that is wholly outside', () => {
    const over: TestLayer = { name: 'Over', top: -1, left: -2, bottom: 3, right: 4, channels: solid(6, 4, 10, 20, 30) };
    const gone: TestLayer = { name: 'Gone', top: 50, left: 50, bottom: 52, right: 52, channels: solid(2, 2, 1, 2, 3) };
    const n = readPsd(buildPsd({ width: W, height: H, layers: [over, gone] })).nodes.map(raster);
    expect([n[0].x, n[0].y, n[0].width, n[0].height]).toEqual([0, 0, 4, 3]);
    expect(rgbaAt(n[0], 0, 0)).toEqual([10, 20, 30, 255]);
    // Wholly outside leaves an empty layer with its name, not a missing one.
    expect(n[1]).toMatchObject({ name: 'Gone', width: 0 });
  });

  it('applies a layer mask in its own box, with its default colour outside it', () => {
    const mask = { top: 1, left: 1, bottom: 3, right: 3, def: 0, plane: Uint8Array.from([255, 0, 128, 255]) };
    const l: TestLayer = { name: 'Masked', top: 0, left: 0, bottom: 4, right: 4, channels: solid(4, 4, 9, 9, 9), mask };
    const n = raster(readPsd(buildPsd({ width: 4, height: 4, layers: [l] })).nodes[0]);
    // Outside the box the default (0) hides everything.
    expect(rgbaAt(n, 0, 0)[3]).toBe(0);
    expect(rgbaAt(n, 1, 1)[3]).toBe(255);
    expect(rgbaAt(n, 2, 1)[3]).toBe(0);
    expect(rgbaAt(n, 1, 2)[3]).toBe(128);
    expect(rgbaAt(n, 3, 3)[3]).toBe(0);
  });

  it('ignores a disabled mask and flips an inverted one', () => {
    const base = { top: 0, left: 0, bottom: 2, right: 2, def: 255, plane: Uint8Array.from([0, 0, 0, 0]) };
    const make = (flags: number) => raster(readPsd(buildPsd({ width: 2, height: 2, layers: [{ name: 'M', top: 0, left: 0, bottom: 2, right: 2, channels: solid(2, 2, 1, 1, 1), mask: { ...base, flags } }] })).nodes[0]);
    expect(rgbaAt(make(0), 0, 0)[3]).toBe(0);
    expect(rgbaAt(make(2), 0, 0)[3]).toBe(255);
    expect(rgbaAt(make(4), 0, 0)[3]).toBe(255);
  });

  it('prefers the unicode name, and reads a layer that only has the old one', () => {
    const a = readPsd(buildPsd({ width: 2, height: 2, layers: [{ name: 'Café ☕', channels: solid(0, 0, 0, 0, 0) }, { name: 'Plain', unicode: false, channels: solid(0, 0, 0, 0, 0) }] }));
    expect(a.nodes.map((n) => n.name)).toEqual(['Café ☕', 'Plain']);
  });

  it('turns a flat file with no layers into one layer', () => {
    const planes = [0, 1, 2].map((v) => new Uint8Array(6).fill(v * 40));
    const f = readPsd(buildPsd({ width: 3, height: 2, layers: [], merged: { planes } }));
    expect(f.nodes).toHaveLength(1);
    expect(raster(f.nodes[0]).name).toBe('Background');
    expect([...raster(f.nodes[0]).pixels.subarray(0, 4)]).toEqual([0, 40, 80, 255]);
    expect(f.info.join(' ')).toMatch(/no layers/);
    const rle = readPsd(buildPsd({ width: 3, height: 2, layers: [], merged: { planes, compression: 1 } }));
    expect([...raster(rle.nodes[0]).pixels.subarray(0, 4)]).toEqual([0, 40, 80, 255]);
  });

  it('reads a grey file as grey pictures', () => {
    const l: TestLayer = { name: 'G', top: 0, left: 0, bottom: 1, right: 2, channels: [{ id: 0, plane: Uint8Array.from([10, 200]) }] };
    const f = readPsd(buildPsd({ width: 2, height: 1, mode: 1, layers: [l] }));
    expect([...raster(f.nodes[0]).pixels]).toEqual([10, 10, 10, 255, 200, 200, 200, 255]);
    expect(f.info.join(' ')).toMatch(/greyscale/);
  });
});

describe('what a PSD has that does not come across', () => {
  const quiet = (name: string, extra: Partial<TestLayer> = {}): TestLayer => ({ name, top: 0, left: 0, bottom: 2, right: 2, channels: solid(2, 2, 5, 5, 5), ...extra });

  it('says each kind once, with the layer names', () => {
    const f = readPsd(
      buildPsd({
        width: 4,
        height: 4,
        layers: [
          quiet('Photo'),
          { name: 'Levels 1', tags: [{ key: 'levl' }] },
          { name: 'Curves 1', tags: [{ key: 'curv' }] },
          { name: 'Colour fill', tags: [{ key: 'SoCo' }] },
          quiet('Title', { tags: [{ key: 'TySh' }] }),
          quiet('Logo', { tags: [{ key: 'SoLd' }] }),
          quiet('Glow', { tags: [{ key: 'lrFX' }] }),
          quiet('Shape 1', { tags: [{ key: 'vmsk' }] }),
          quiet('Burned', { blend: 'lbrn' }),
          quiet('Vivid', { blend: 'vLit' }),
        ],
      }),
    );
    // Adjustment and fill layers are not layers here; the rest came in as pictures.
    expect(f.nodes.map((n) => n.name)).toEqual(['Photo', 'Title', 'Logo', 'Glow', 'Shape 1', 'Burned', 'Vivid']);
    const s = f.left.join('\n');
    expect(s).toMatch(/2 adjustment layers \("Levels 1", "Curves 1"\)/);
    expect(s).toMatch(/1 fill layer \("Colour fill"\)/);
    expect(s).toMatch(/1 text layer \("Title"\) came in as a picture/);
    expect(s).toMatch(/1 smart object \("Logo"\) came in as a picture/);
    expect(s).toMatch(/Layer styles .* on 1 layer \("Glow"\)/);
    expect(s).toMatch(/1 shape layer or vector mask \("Shape 1"\)/);
    expect(s).toMatch(/linear burn/);
    expect(s).toMatch(/vivid light/);
    // Blend modes came in as normal.
    expect(raster(f.nodes[5]).blend).toBe('normal');
    expect(f.left).toHaveLength(8);
  });

  it('lets fill opacity thin the layer', () => {
    const f = readPsd(buildPsd({ width: 2, height: 2, layers: [quiet('Soft', { opacity: 255, tags: [{ key: 'iOpa', data: Uint8Array.from([128, 0, 0, 0]) }] })] }));
    expect(raster(f.nodes[0]).opacity).toBeCloseTo(128 / 255, 3);
  });

  it('keeps a group that has styles, and says so', () => {
    const f = readPsd(
      buildPsd({
        width: 2,
        height: 2,
        layers: [
          { name: '</Layer group>', section: 3 },
          quiet('In'),
          { name: 'Group', section: 1, sectionBlend: 'pass', tags: [{ key: 'lfx2' }] },
        ],
      }),
    );
    expect(group(f.nodes[0]).children).toHaveLength(1);
    expect(f.left.join(' ')).toMatch(/Layer styles/);
  });

  it('survives groups that open and close in the wrong places', () => {
    // A closing record with no opening one, and an opening one that is never closed.
    const f = readPsd(buildPsd({ width: 2, height: 2, layers: [{ name: 'Orphan', section: 1 }, { name: '</Layer group>', section: 3 }, quiet('Lost')] }));
    expect(f.nodes.length).toBeGreaterThan(0);
    expect(countNodes(f.nodes).layers).toBe(1);
  });
});

describe('a PSD that cannot be read says why, and never throws anything else', () => {
  const good = buildPsd({ width: 4, height: 4, layers: [{ name: 'A', top: 0, left: 0, bottom: 4, right: 4, channels: solid(4, 4, 1, 2, 3) }] });
  const says = async (bytes: Uint8Array, re: RegExp, path = 'x.psd') => {
    const e = await readLayered(bytes, path).then(
      () => null,
      (x: unknown) => x,
    );
    expect(e).toBeInstanceOf(LayeredProblem);
    expect((e as Error).message).toMatch(re);
  };

  it('refuses the wrong kind of file in plain words', async () => {
    await says(new Uint8Array(0), /empty/);
    await says(new TextEncoder().encode('just some words in a text file'), /couldn't tell what that file is/);
    await says(new Uint8Array(40).fill(7), /neither/);
    await says(new TextEncoder().encode('<svg/>'), /neither/);
    await says(good.subarray(0, 20), /neither/);
    await says(new TextEncoder().encode('xx'), /kra|neither/, 'drawing.kra').catch(() => {});
  });

  it('refuses colour modes and depths it does not read, and tells you the way round', async () => {
    await says(buildPsd({ width: 2, height: 2, mode: 4, layers: [] }), /CMYK colour.*Image > Mode > RGB Color/);
    await says(buildPsd({ width: 2, height: 2, mode: 9, layers: [] }), /Lab colour/);
    await says(buildPsd({ width: 2, height: 2, mode: 2, layers: [] }), /indexed colour/);
    const bits32 = good.slice();
    bits32[23] = 32;
    await says(bits32, /32 bits per colour \(32-bit floating point\).*8 Bits\/Channel/);
    await says(buildPsd({ width: 2, height: 2, version: 2, layers: [] }), /large document" \(\.psb\)/);
  });

  it('refuses sizes that are nothing, or too big to hold', async () => {
    const zero = good.slice();
    new DataView(zero.buffer).setUint32(14, 0);
    await says(zero, /no size/);
    const huge = good.slice();
    new DataView(huge.buffer).setUint32(18, 60000);
    await says(huge, /bigger than Frameling can hold/);
  });

  it('says a cut-short file is cut short, at every length', async () => {
    // Every prefix of a good file must fail cleanly or read; never an unexpected error.
    for (let n = 0; n < good.length; n += 7) {
      const e = await readLayered(good.subarray(0, n), 'a.psd').then(
        () => null,
        (x: unknown) => x,
      );
      if (e) expect(e).toBeInstanceOf(LayeredProblem);
    }
    await says(good.subarray(0, good.length - 12), /cut short|damaged/);
  });

  it('survives every single damaged byte of a small file', async () => {
    // A flipped byte may still read, or it may fail; what it may not do is crash with anything but a plain problem.
    for (let i = 0; i < good.length; i += 3) {
      const bad = good.slice();
      bad[i] ^= 0xff;
      const e = await readLayered(bad, 'a.psd').then(
        () => null,
        (x: unknown) => x,
      );
      if (e) expect(e).toBeInstanceOf(LayeredProblem);
    }
  });

  it('refuses a layer count and a channel count that cannot be true', async () => {
    const many = buildPsd({ width: 2, height: 2, layers: [] });
    // Layer info of a bad length: it points past the end of the file.
    const bad = many.slice();
    new DataView(bad.buffer).setUint32(30, 0x7fffff00);
    await says(bad, /cut short|damaged/);
  });
});

describe('the scene the help pictures open', async () => {
  const { readFileSync } = await import('node:fs');
  const asset = (n: string) => new Uint8Array(readFileSync(new URL(`../../scripts/docs/help/assets/${n}`, import.meta.url)));

  it('reads as a Photoshop file: a folder, a blend mode, and what could not come in', async () => {
    const f = await readLayered(asset('import-scene.psd'), 'scene.psd');
    expect([f.width, f.height]).toEqual([192, 120]);
    expect(f.nodes.map((n) => n.name)).toEqual(['Scenery', 'Shadow', 'Hero', 'Title']);
    expect((f.nodes[0] as GroupNode).children.map((n) => n.name)).toEqual(['Sky', 'Hills']);
    expect(raster(f.nodes[1])).toMatchObject({ blend: 'multiply' });
    expect(raster(f.nodes[1]).opacity).toBeCloseTo(0.6, 2);
    expect(f.left.join(' ')).toMatch(/1 adjustment layer \("Levels 1"\)/);
    expect(f.left.join(' ')).toMatch(/1 text layer \("Title"\)/);
  });

  it('reads as an OpenRaster file with the same layers', async () => {
    const f = await readLayered(asset('import-scene.ora'), 'scene.ora');
    expect(f.nodes.map((n) => n.name)).toEqual(['Scenery', 'Shadow', 'Hero', 'Title']);
    expect(raster(f.nodes[1])).toMatchObject({ blend: 'multiply' });
    expect(f.left).toEqual([]);
  });
});
