import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { encodePng } from '../../src/io/png';
import { countNodes, layeredPieces } from '../../src/import/layered/build';
import { LayeredProblem, type GroupNode, type RasterNode } from '../../src/import/layered/model';
import { readLayered } from '../../src/import/layered/read';

const png = (w: number, h: number, r: number, g: number, b: number, a = 255) => {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([r, g, b, a], i * 4);
  return encodePng({ width: w, height: h, pixels: px });
};

const stack = (inner: string, w = 8, h = 6) => `<?xml version="1.0" encoding="UTF-8"?><image w="${w}" h="${h}" version="0.0.3"><stack>${inner}</stack></image>`;

function ora(xml: string, extra: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({ mimetype: [strToU8('image/openraster'), { level: 0 }], 'stack.xml': strToU8(xml), 'data/a.png': png(4, 3, 255, 0, 0), 'data/b.png': png(2, 2, 0, 255, 0, 128), 'data/c.png': png(8, 6, 0, 0, 255), ...extra });
}

const raster = (n: unknown) => n as RasterNode;
const says = async (bytes: Uint8Array, re: RegExp, path = 'x.ora') => {
  const e = await readLayered(bytes, path).then(
    () => null,
    (x: unknown) => x,
  );
  expect(e).toBeInstanceOf(LayeredProblem);
  expect((e as Error).message).toMatch(re);
};

describe('OpenRaster files', () => {
  it('reads layers top first into bottom first, with position, opacity, visibility and blend', async () => {
    const f = await readLayered(
      ora(
        stack(`<layer name="Top" src="data/b.png" x="3" y="-1" opacity="0.5" visibility="hidden" composite-op="svg:multiply"/>
        <layer name="Middle" src="data/a.png" x="1" y="2" opacity="1.0" visibility="visible" composite-op="svg:src-over" edit-locked="true"/>
        <layer name="Bottom" src="data/c.png"/>`),
      ),
      'x.ora',
    );
    expect([f.format, f.width, f.height]).toEqual(['ora', 8, 6]);
    expect(f.nodes.map((n) => n.name)).toEqual(['Bottom', 'Middle', 'Top']);
    expect(raster(f.nodes[2])).toMatchObject({ x: 3, y: -1, width: 2, height: 2, opacity: 0.5, hidden: true, blend: 'multiply' });
    expect([...raster(f.nodes[2]).pixels.subarray(0, 4)]).toEqual([0, 255, 0, 128]);
    expect(raster(f.nodes[1])).toMatchObject({ x: 1, y: 2, locked: true, blend: 'normal' });
    expect(f.left).toEqual([]);
  });

  it('keeps stacks as groups, nested, with their own opacity', async () => {
    const f = await readLayered(
      ora(
        stack(`<stack name="Outer" opacity="0.8"><stack name="Inner"><layer name="Deep" src="data/a.png"/></stack><layer name="Side" src="data/b.png"/></stack>
        <layer name="Floor" src="data/c.png"/>`),
      ),
    );
    expect(f.nodes.map((n) => n.name)).toEqual(['Floor', 'Outer']);
    const outer = f.nodes[1] as GroupNode;
    expect(outer.opacity).toBeCloseTo(0.8);
    expect(outer.children.map((n) => n.name)).toEqual(['Side', 'Inner']);
    expect(countNodes(f.nodes)).toEqual({ layers: 3, groups: 2 });
    const p = layeredPieces(f);
    expect(p.layers.map((l) => l.name)).toEqual(['Floor', 'Side', 'Deep']);
    const folderNames = Object.values(p.folders).map((x) => x.name).sort();
    expect(folderNames).toEqual(['Inner', 'Outer']);
    const inner = Object.values(p.folders).find((x) => x.name === 'Inner')!;
    expect(p.folders[inner.parent!].name).toBe('Outer');
  });

  it('says what it could not take: a blend mode it lacks, a missing picture, a damaged one', async () => {
    const f = await readLayered(
      ora(
        stack(`<layer name="Odd" src="data/a.png" composite-op="krita:darker color"/>
        <layer name="Ghost" src="data/none.png"/>
        <layer name="Broken" src="data/broken.png"/>
        <layer name="Fine" src="data/c.png"/>`),
        { 'data/broken.png': strToU8('not really a png') },
      ),
    );
    expect(f.nodes.map((n) => n.name)).toEqual(['Fine', 'Odd']);
    expect(raster(f.nodes[1]).blend).toBe('normal');
    const s = f.left.join('\n');
    expect(s).toMatch(/1 layer \("Odd"\) used the blend mode "darker color"/);
    expect(s).toMatch(/1 layer \("Ghost"\) whose picture isn't in the file/);
    expect(s).toMatch(/1 layer \("Broken"\) whose picture can't be read/);
  });

  it('says plainly when it is a Krita file, a zip without layers, or not an OpenRaster file at all', async () => {
    await says(zipSync({ 'maindoc.xml': strToU8('<DOC/>'), mimetype: strToU8('application/x-krita') }), /Krita file \(\.kra\).*File > Export.*OpenRaster \(\.ora\) or Photoshop \(\.psd\)/, 'a.kra');
    await says(zipSync({ 'readme.txt': strToU8('hello') }), /no stack\.xml/);
    await says(strToU8('this is not a zip'), /couldn't tell what that file is/);
    await says(ora('<image w="4" h="4"><stack></stack></image>'), /no layers/);
    await says(ora('<image w="0" h="4"><stack><layer src="data/a.png"/></stack></image>'), /how big the picture is/);
    await says(ora('<image w="99999" h="4"><stack><layer src="data/a.png"/></stack></image>'), /bigger than Frameling can hold/);
    await says(ora('<svg/>'), /isn't an OpenRaster/);
    await says(ora('<image w="4" h="4"><stack><layer src="data/a.png"></image>'), /layer list in that file can't be read/);
    await says(ora(stack('<layer name="Gone" src="data/none.png"/>')), /no layers that Frameling can read/);
  });

  it('survives a zip cut short or damaged anywhere', async () => {
    const good = ora(stack('<layer name="A" src="data/a.png"/>'));
    for (let n = 0; n < good.length; n += 11) {
      const e = await readLayered(good.subarray(0, n), 'x.ora').then(
        () => null,
        (x: unknown) => x,
      );
      if (e) expect(e).toBeInstanceOf(LayeredProblem);
    }
    for (let i = 0; i < good.length; i += 13) {
      const bad = good.slice();
      bad[i] ^= 0xff;
      const e = await readLayered(bad, 'x.ora').then(
        () => null,
        (x: unknown) => x,
      );
      if (e) expect(e).toBeInstanceOf(LayeredProblem);
    }
  });
});
