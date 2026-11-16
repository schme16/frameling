import { readFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { layeredPieces } from '../../src/import/layered/build';
import { LayeredProblem, type GroupNode, type RasterNode } from '../../src/import/layered/model';
import { looksLikePhotocraft, photocraftBlend, readPhotocraft } from '../../src/import/layered/photocraft';
import { readLayered } from '../../src/import/layered/read';
import { decodePicture } from '../../src/pixel/import/picture';
import { fakeHash, pcraft, rasterLayer, solidTile, zstdRaw } from './craftBuilder';

const real = () => new Uint8Array(readFileSync(new URL('../fixtures/import/test.pcraft', import.meta.url)));
const raster = (n: unknown) => n as RasterNode;
const says = async (bytes: Uint8Array, re: RegExp, path = 'x.pcraft') => {
  const e = await readLayered(bytes, path).then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(LayeredProblem);
  expect((e as Error).message).toMatch(re);
};

describe('Photocraft files: the real one', () => {
  it('reads test.pcraft: one layer, 640 x 360, and the pixels are the ones in its own preview', async () => {
    const f = await readLayered(real(), 'test.pcraft');
    expect([f.format, f.width, f.height, f.nodes.length]).toEqual(['photocraft', 640, 360, 1]);
    const l = raster(f.nodes[0]);
    expect([l.name, l.hidden, l.opacity, l.blend, l.clip, l.x, l.y, l.width, l.height]).toEqual(['Background', false, 1, 'normal', false, 0, 0, 640, 360]);
    expect(f.left).toEqual([]);
    // The file keeps a flattened preview: with one layer, the tiles put together are exactly it.
    const zip = await import('fflate').then((m) => m.unzipSync(real()));
    const preview = await decodePicture(zip['composite/preview.png']);
    expect(preview.width).toBe(640);
    let differing = 0;
    for (let i = 0; i < l.pixels.length; i++) if (Math.abs(l.pixels[i] - preview.frames[0].pixels[i]) > 1) differing++;
    expect(differing).toBe(0);
    // And it is a drawing, not a blank: black strokes on white.
    const dark = [...l.pixels].filter((_, i) => i % 4 === 0 && l.pixels[i] < 50).length;
    expect(dark).toBeGreaterThan(1000);
  });

  it('is told apart from an OpenRaster zip by what is inside, and builds one pixel layer', async () => {
    const names = Object.keys((await import('fflate')).unzipSync(real()));
    expect(looksLikePhotocraft(names)).toBe(true);
    expect(looksLikePhotocraft([...names, 'stack.xml'])).toBe(false);
    const f = await readLayered(real(), 'test.pcraft');
    const p = layeredPieces(f);
    expect(p.layers.length).toBe(1);
    expect(p.layers[0].name).toBe('Background');
  });
});

describe('Photocraft layers', () => {
  it('keeps names, order, opacity, blend, hiding, clipping, locks, and puts tiles where they belong', async () => {
    const a = rasterLayer('Paper', [{ tx: 0, ty: 0, side: 16, px: [255, 255, 255, 255] }, { tx: 1, ty: 0, side: 16, px: [255, 255, 255, 255] }]);
    const b = rasterLayer('Ink', [{ tx: 1, ty: 1, side: 16, px: [10, 20, 30, 200] }], { opacity: 0.5, fill_opacity: 0.5, blend: 'ColorDodge', visible: false, clipped: true, locks: { all: false, pixels: true } });
    const f = await readPhotocraft(pcraft([a, b], { width: 32, height: 32 }));
    expect(f.nodes.map((n) => n.name)).toEqual(['Paper', 'Ink']);
    const paper = raster(f.nodes[0]);
    // Two tiles across the top, none below: the layer is the 32 x 16 strip they cover.
    expect([paper.x, paper.y, paper.width, paper.height]).toEqual([0, 0, 32, 16]);
    expect([...paper.pixels.subarray(0, 4)]).toEqual([255, 255, 255, 255]);
    const ink = raster(f.nodes[1]);
    expect([ink.x, ink.y, ink.width, ink.height]).toEqual([16, 16, 16, 16]);
    expect([...ink.pixels.subarray(0, 4)]).toEqual([10, 20, 30, 200]);
    expect([ink.opacity, ink.blend, ink.hidden, ink.clip, ink.locked]).toEqual([0.25, 'color-dodge', true, true, true]);
    expect(f.left).toEqual([]);
  });

  it('turns a group into a folder, whichever way the file lists what is inside it', async () => {
    const inner = rasterLayer('Inner', [{ tx: 0, ty: 0 }]);
    const group = { layer: { ...rasterLayer('Hair', []).layer, content: { kind: 'group', layers: [inner.layer] }, opacity: 0.8 }, files: inner.files };
    const f = await readPhotocraft(pcraft([group]));
    const g = f.nodes[0] as GroupNode;
    expect([g.type, g.name, g.opacity, g.children.length]).toEqual(['group', 'Hair', 0.8, 1]);
    const g2 = { layer: { ...rasterLayer('Hair', []).layer, content: { kind: 'group', children: [inner.layer] } }, files: inner.files };
    expect(((await readPhotocraft(pcraft([g2]))).nodes[0] as GroupNode).children.length).toBe(1);
  });

  it('says plainly what it could not bring: masks, styles, blend modes, and kinds of layer with no picture in them', async () => {
    const a = rasterLayer('Hero', [{ tx: 0, ty: 0 }], { mask: { rect: [0, 0, 1, 1] }, effects: { enabled: true, items: [{ kind: 'DropShadow' }] }, blend: 'VividLight' });
    const t = { layer: { ...rasterLayer('Title', []).layer, content: { kind: 'text', runs: [] } } };
    const adj = { layer: { ...rasterLayer('Curves 1', []).layer, content: { kind: 'adjustment' } } };
    const f = await readPhotocraft(pcraft([a, t, adj]));
    expect(f.nodes.length).toBe(1);
    const said = f.left.join('\n');
    expect(said).toMatch(/layer mask on "Hero"/);
    expect(said).toMatch(/layer styles/);
    expect(said).toMatch(/"VividLight"/);
    expect(said).toMatch(/"Title".*text layers/);
    expect(said).toMatch(/"Curves 1".*adjustment layers/);
    expect(raster(f.nodes[0]).blend).toBe('normal');
  });

  it('fills the places with no tile with the layer\'s default colour, across the whole picture', async () => {
    const a = rasterLayer('Sky', [{ tx: 0, ty: 0, side: 16, px: [0, 0, 255, 255] }], {}, { default: '112233ff' });
    const l = raster((await readPhotocraft(pcraft([a], { width: 32, height: 20 }))).nodes[0]);
    expect([l.x, l.y, l.width, l.height]).toEqual([0, 0, 32, 20]);
    expect([...l.pixels.subarray(0, 4)]).toEqual([0, 0, 255, 255]);
    expect([...l.pixels.subarray(20 * 4, 20 * 4 + 4)]).toEqual([0x11, 0x22, 0x33, 0xff]);
  });

  it('keeps only what lies on the picture: tiles off the edge or at negative places are cut or skipped', async () => {
    const a = rasterLayer('Wide', [{ tx: -1, ty: 0, side: 16, px: [9, 9, 9, 255] }, { tx: 0, ty: 0, side: 16, px: [1, 2, 3, 255] }, { tx: 5, ty: 0, side: 16 }]);
    const l = raster((await readPhotocraft(pcraft([a], { width: 24, height: 16 }))).nodes[0]);
    expect([l.x, l.y, l.width, l.height]).toEqual([0, 0, 24, 16]);
    expect([...l.pixels.subarray(0, 4)]).toEqual([1, 2, 3, 255]);
    // Past the first tile there is nothing: clear.
    expect(l.pixels[16 * 4 + 3]).toBe(0);
  });

  it('reads grey tiles, with and without alpha, and tiles with no alpha', async () => {
    const g = rasterLayer('Grey', [{ tx: 0, ty: 0, side: 16, px: [100, 50] }], {}, { format: { mode: 'Gray', sample: 'U8', alpha: true } });
    const g1 = rasterLayer('Grey1', [{ tx: 0, ty: 0, side: 16, px: [100] }], {}, { format: { mode: 'Gray', sample: 'U8', alpha: false } });
    const rgb = rasterLayer('Rgb', [{ tx: 0, ty: 0, side: 16, px: [1, 2, 3] }], {}, { format: { mode: 'Rgb', sample: 'U8', alpha: false } });
    const f = await readPhotocraft(pcraft([g, g1, rgb]));
    expect([...raster(f.nodes[0]).pixels.subarray(0, 4)]).toEqual([100, 100, 100, 50]);
    expect([...raster(f.nodes[1]).pixels.subarray(0, 4)]).toEqual([100, 100, 100, 255]);
    expect([...raster(f.nodes[2]).pixels.subarray(0, 4)]).toEqual([1, 2, 3, 255]);
  });

  it('names layers it cannot read colour for (16 bit, CMYK) and carries on with the rest', async () => {
    const ok = rasterLayer('Fine', [{ tx: 0, ty: 0 }]);
    const deep = rasterLayer('Deep', [{ tx: 0, ty: 0 }], {}, { format: { mode: 'Rgb', sample: 'U16', alpha: true } });
    const cmyk = rasterLayer('Print', [{ tx: 0, ty: 0 }], {}, { format: { mode: 'Cmyk', sample: 'U8', alpha: true } });
    const f = await readPhotocraft(pcraft([ok, deep, cmyk]));
    expect(f.nodes.map((n) => n.name)).toEqual(['Fine']);
    expect(f.left.join('\n')).toMatch(/16 bit/);
    expect(f.left.join('\n')).toMatch(/Cmyk colour/);
  });

  it('reads a layer whose tile is missing from the zip as unreadable, and says so', async () => {
    const a = rasterLayer('Gone', [{ tx: 0, ty: 0 }]);
    const f = await readPhotocraft(pcraft([rasterLayer('Fine', [{ tx: 0, ty: 0 }]), { layer: a.layer }]));
    expect(f.nodes.length).toBe(1);
    expect(f.left.join('\n')).toMatch(/"Gone".*not in the file/);
  });

  it('says when the file is newer than it knows, and when it has a colour profile', async () => {
    const f = await readPhotocraft(pcraft([rasterLayer('A', [{ tx: 0, ty: 0 }])], { version: 2, doc: { icc_profile: { name: 'sRGB' } } }));
    expect(f.info.join('\n')).toMatch(/version 2/);
    expect(f.info.join('\n')).toMatch(/colour profile/);
  });

  it('knows its blend names however they are spelt', () => {
    expect(photocraftBlend('Color Dodge')).toBe('color-dodge');
    expect(photocraftBlend('hard-light')).toBe('hard-light');
    expect(photocraftBlend('Luminosity')).toBe('luminosity');
    expect(photocraftBlend('Pin Light')).toBeNull();
  });
});

describe('Photocraft files that cannot be read', () => {
  it('refuses a file that is not a zip, saying what it looks like', async () => {
    await says(strToU8('hello there, this is plain text and long enough'), /named like a Photocraft file, but a Photocraft file is a zip/);
    await says(strToU8('hello there, this is plain text and long enough'), /couldn't tell what that file is/, 'x.dat');
    await says(strToU8('{"format":"vectorcraft"}'), /VectorCraft file/, 'poster.vectorcraft');
  });

  it('refuses an empty file', async () => {
    await says(new Uint8Array(0), /empty/);
  });

  it('refuses a zip with no manifest, a manifest that is not text, and a manifest with no document', async () => {
    await says(zipSync({ ['tiles/' + fakeHash() + '.zst']: zstdRaw(solidTile(16, [1, 2, 3, 4])), 'composite/preview.png': new Uint8Array(40) }), /no manifest\.json/);
    await says(zipSync({ 'manifest.json': new Uint8Array([0xff, 0xfe, 0x00, 0x41]), 'composite/preview.png': new Uint8Array(40) }), /isn't valid text/);
    await says(zipSync({ 'manifest.json': strToU8('{"format_version":1}'), 'composite/preview.png': new Uint8Array(40) }), /no document/);
    await says(zipSync({ 'manifest.json': strToU8('[1,2'), 'composite/preview.png': new Uint8Array(40) }), /isn't valid text/);
  });

  it('refuses a file with a name that points outside the archive, and reads nothing from it', async () => {
    const ok = rasterLayer('A', [{ tx: 0, ty: 0 }]);
    for (const evil of ['../evil.txt', '/etc/passwd', 'tiles/../../x', 'a\\b.txt', 'C:/x.txt']) {
      await says(pcraft([ok], { files: { [evil]: strToU8('x') } }), /can't be trusted.*points outside/);
    }
  });

  it('refuses a picture bigger than it can hold, and one with no size', async () => {
    const ok = rasterLayer('A', [{ tx: 0, ty: 0 }]);
    await says(pcraft([ok], { width: 20000, height: 10 }), /bigger than Frameling can hold/);
    await says(pcraft([ok], { width: 0, height: 10 }), /does not say how big/);
  });

  it('refuses a layer whose tile is a decompression bomb, without allocating it, and carries on', async () => {
    const bomb = rasterLayer('Bomb', [{ tx: 0, ty: 0, raw: zstdRaw(new Uint8Array(10), { declare: 3_000_000_000 }) }]);
    const fine = rasterLayer('Fine', [{ tx: 0, ty: 0 }]);
    const f = await readPhotocraft(pcraft([fine, bomb]));
    expect(f.nodes.map((n) => n.name)).toEqual(['Fine']);
    expect(f.left.join('\n')).toMatch(/"Bomb".*can't be read.*bigger than a tile/);
  });

  it('refuses tiles that are damaged or not all one size', async () => {
    const junk = rasterLayer('Junk', [{ tx: 0, ty: 0, raw: strToU8('this is not zstd at all') }]);
    const mixed = rasterLayer('Mixed', [{ tx: 0, ty: 0, side: 16 }, { tx: 1, ty: 0, side: 8 }]);
    const f = await readPhotocraft(pcraft([rasterLayer('Fine', [{ tx: 0, ty: 0 }]), junk, mixed]));
    expect(f.nodes.map((n) => n.name)).toEqual(['Fine']);
    expect(f.left.join('\n')).toMatch(/not a zstandard frame/);
    expect(f.left.join('\n')).toMatch(/not all the same size|can't be read/);
  });

  it('refuses a file with no layer it can read, saying why', async () => {
    const t = { layer: { ...rasterLayer('Title', []).layer, content: { kind: 'text' } } };
    await says(pcraft([t]), /no layers that Frameling can read.*text layers/);
  });

  it('falls back to the flattened preview, and says so, when no layer can be read but the preview is there', async () => {
    const zip = (await import('fflate')).unzipSync(real());
    const t = { layer: { ...rasterLayer('Title', []).layer, content: { kind: 'text' } } };
    const f = await readPhotocraft(pcraft([t], { width: 640, height: 360, files: { 'composite/preview.png': zip['composite/preview.png'] } }));
    expect(f.nodes.length).toBe(1);
    expect(f.info.join('\n')).toMatch(/flattened picture/);
    expect(raster(f.nodes[0]).width).toBe(640);
  });

  it('does not run anything: a file full of scripts and a huge claimed size is just ignored data', async () => {
    const ok = rasterLayer('A', [{ tx: 0, ty: 0 }]);
    const f = await readPhotocraft(pcraft([ok], { files: { 'run.sh': strToU8('rm -rf /'), 'plugin.js': strToU8('throw 1'), 'thumb.png': new Uint8Array(3) } }));
    expect(f.nodes.length).toBe(1);
  });
});
