import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { PathShape, TextShape } from '../../src/core/format';
import { craftCounts, craftDoc, craftPieces, craftScale } from '../../src/import/craft/build';
import { craftColor, CraftProblem, describeBytes, readVectorcraft, type VectorcraftFile } from '../../src/import/craft/vectorcraft';

const realBytes = () => new Uint8Array(readFileSync(new URL('../fixtures/import/dusk-poster.vectorcraft', import.meta.url)));
const text = (s: string) => new TextEncoder().encode(s);
const enc = (o: unknown) => text(JSON.stringify(o));
const rgb = (r: number, g: number, b: number) => ({ model: 'rgb', r, g, b });
const solid = (c: unknown) => ({ type: 'solid', color: c });
const pt = (x: number, y: number, extra: Record<string, unknown> = {}) => ({ p: [x, y], ...extra });
const rect = (x0: number, y0: number, x1: number, y1: number) => ({ subpaths: [{ anchors: [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)], closed: true }] });
const item = (path: unknown, fill: unknown = solid(rgb(1, 0, 0)), extra: Record<string, unknown> = {}, stroke: unknown = { type: 'none' }, width = 2) => ({
  id: 1,
  appearance: { items: [{ kind: 'fill', paint: fill }, { kind: 'stroke', paint: stroke, width }] },
  kind: { type: 'path', path },
  ...extra,
});
const file = (children: unknown[], extra: Record<string, unknown> = {}, docExtra: Record<string, unknown> = {}) => ({
  format: 'vectorcraft',
  version: 4,
  generator: 'test',
  document: { title: 'T', units: 'Points', artboards: [{ id: 1, name: 'Board', rect: { x0: 0, y0: 0, x1: 100, y1: 80 } }], layers: [{ id: 1, name: 'Layer 1', kind: { type: 'layer', children } }], swatches: [], swatch_groups: [], ...docExtra },
  images: {},
  ...extra,
});
const read = (o: unknown) => readVectorcraft(enc(o));
const says = (bytes: Uint8Array, re: RegExp) => {
  let e: unknown = null;
  try {
    readVectorcraft(bytes);
  } catch (x) {
    e = x;
  }
  expect(e).toBeInstanceOf(CraftProblem);
  expect((e as Error).message).toMatch(re);
};
const shapesOf = (f: VectorcraftFile, board = 0) => f.boards[board].layers.flatMap((l) => l.shapes);
const paths = (f: VectorcraftFile, board = 0) => shapesOf(f, board).filter((s): s is PathShape => s.type === 'path');

describe('dusk-poster.vectorcraft, the real file', () => {
  const f = readVectorcraft(realBytes());

  it('is one 600 x 800 artboard, one layer, and 41 shapes (39 paths and 2 pieces of text)', () => {
    expect(f.title).toBe('Dusk Poster');
    expect(f.boards.map((b) => [b.name, b.x, b.y, b.width, b.height])).toEqual([['Artboard 1', 0, 0, 600, 800]]);
    expect(f.boards[0].layers.map((l) => [l.name, l.visible, l.shapes.length])).toEqual([['Layer 1', true, 41]]);
    expect(f.counts).toMatchObject({ shapes: 41, text: 2, gradients: 3, layers: 1 });
    expect(craftCounts(f)).toEqual({ shapes: 41, text: 2 });
  });

  it('keeps the sky as a gradient from the horizon (bottom) to the top, reaching the corners', () => {
    const sky = paths(f)[0];
    expect(sky.fillGradient?.kind).toBe('linear');
    expect(sky.fillGradient?.from).toEqual({ x: 300, y: 800 });
    expect(sky.fillGradient?.to).toEqual({ x: 300, y: 0 });
    expect(sky.fillGradient?.stops.map((s) => [s.at, s.color])).toEqual([[0, '#ffb347'], [0.45, '#ff5e62'], [0.75, '#7b2d8e'], [1, '#1f1147']]);
    expect(sky.stroke).toBeNull();
    expect(sky.paths[0].closed).toBe(true);
    expect(sky.paths[0].points.length).toBe(4);
  });

  it('keeps the sun: a radial gradient, its four curved points, and its glow as a glow', () => {
    const sun = paths(f).find((s) => s.fillGradient?.kind === 'radial')!;
    expect(sun.fillGradient?.from).toEqual({ x: 300, y: 440 });
    expect(sun.fillGradient?.to).toEqual({ x: 410, y: 440 });
    expect(sun.paths[0].points.length).toBe(4);
    // The segment arriving at the second point leaves the first by its out handle and comes in by the second's in handle.
    const p1 = sun.paths[0].points[1];
    expect(p1.c1).toEqual({ x: 190, y: 379.2486775186127 });
    expect(p1.c2).toEqual({ x: 239.2486775186127, y: 330 });
    // The closing curve (back to the first point) sits on the first point.
    expect(sun.paths[0].points[0].c1).toBeDefined();
    expect(sun.effects?.[0]).toMatchObject({ kind: 'glow', values: { color: '#ffd36e', size: 40, strength: 0.8 } });
  });

  it('keeps shape see-through, solid colours, and open paths with a handle on one end only', () => {
    const far = paths(f).find((s) => s.opacity === 0.85)!;
    expect(far.fill).toBe('#8e3b8e');
    expect(far.paths[0].points[1].c1).toBeDefined();
    expect(far.paths[0].points[1].c2).toBeDefined();
  });

  it('keeps the title as text: its words, font, weight, size, spacing and place', () => {
    const t = shapesOf(f).filter((s): s is TextShape => s.type === 'text');
    expect(t.map((s) => s.text)).toEqual(['DUSK', 'Made in VectorCraft — vectors, pure Rust']);
    expect([t[0].font, t[0].weight, t[0].size, t[0].transform.x, t[0].transform.y, t[0].color, t[0].align]).toEqual(['Source Sans 3', 700, 110, 64, 130, '#fff6e0', 'left']);
    expect(t[0].letterSpacing).toBeCloseTo(19.8, 5);
    expect(t[1].weight).toBe(400);
  });

  it('keeps the 46 swatches as plain colours, and says what it left out', () => {
    expect(f.swatches.length).toBe(46);
    expect(f.swatches.find((s) => s.name === 'Black')?.color).toBe('#000000');
    expect(f.swatches.find((s) => s.name === 'Red')?.color).toBe('#ed1c24');
    // K=90 is ninety percent black: dark grey, not light.
    expect(f.swatches.find((s) => s.name === 'K=90')?.color).toBe('#191919');
    const said = f.left.join('\n');
    expect(said).toMatch(/gradient or pattern swatches/);
    expect(said).toMatch(/shape with no fill and no line/);
    expect(said).toMatch(/with names \("Sky", "Sun"/);
    expect(said).toMatch(/glow that blends with screen/);
  });

  it('builds a drawing of its own: the artboard size, a vector layer, and the file\'s swatches', () => {
    const { doc, scale } = craftDoc(f, 'Dusk Poster');
    expect(scale).toBe(1);
    expect([doc.width, doc.height, doc.name]).toEqual([600, 800, 'Dusk Poster']);
    expect(doc.layers.length).toBe(1);
    expect(doc.layers[0].kind).toBe('vector');
    expect(Object.values(doc.drawings).length).toBe(1);
    expect(doc.swatches.length).toBe(46);
    expect(doc.artboards).toBeUndefined();
  });

  it('builds layers for the open drawing, fitted and centred, and adds only the colours it did not have', () => {
    const p = craftPieces(f, { stage: { width: 300, height: 400 }, length: 12 });
    expect(p.layers.length).toBe(1);
    expect(p.scale).toBeCloseTo(0.5, 5);
    expect(p.swatches?.length).toBe(46);
  });
});

describe('VectorCraft files that cannot be read', () => {
  it('refuses an empty file, text that is not JSON, and a binary, saying what it looks like', () => {
    says(new Uint8Array(0), /empty/);
    says(text('hello'), /doesn't look like a VectorCraft file.*plain text \(JSON\)/);
    says(new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]), /is a zip.*Photocraft/);
    says(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10]), /PNG/);
    says(text('<svg xmlns="http://www.w3.org/2000/svg"/>'), /SVG.*File > Import > SVG/);
    says(new Uint8Array([0xff, 0xfe, 0xfd]), /doesn't look like a VectorCraft file/);
  });

  it('refuses JSON that is not VectorCraft, and says what it is when it can tell', () => {
    says(enc([1, 2]), /isn't a VectorCraft file/);
    says(enc({ format: 'svg' }), /"format" says "svg"/);
    says(enc({ format_version: 1, document: { size: {} } }), /Photocraft manifest/);
    says(enc({ hello: 1 }), /says nothing/);
  });

  it('refuses a file with no version, no document, no layers, or nothing to size a picture by', () => {
    says(enc({ format: 'vectorcraft', document: {} }), /doesn't say which version/);
    says(enc({ format: 'vectorcraft', version: 4 }), /no drawing in it/);
    says(enc({ format: 'vectorcraft', version: 4, document: { layers: [] } }), /no layers/);
    says(enc(file([], {}, { artboards: [] })), /no artboard and nothing drawn/);
  });

  it('refuses a file bigger than the cap without reading it', () => {
    says({ length: 300 * 1024 * 1024 } as unknown as Uint8Array, /bigger than 256 MB/);
  });

  it('does not run or follow anything in the file: script-looking names and keys are only data', () => {
    const f = read(file([item(rect(0, 0, 10, 10), solid(rgb(0, 1, 0)), { name: '__proto__', constructor: 'x', onload: 'alert(1)' })], { __proto__: { polluted: true }, 'constructor': { prototype: { polluted: true } } }));
    expect(shapesOf(f).length).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('VectorCraft mapping, honestly', () => {
  it('turns anchors with handles into curves, and a plain corner into a straight line', () => {
    const f = read(file([item({ subpaths: [{ anchors: [pt(0, 0, { out: [10, 0] }), pt(20, 20, { in: [20, 10] }), pt(0, 20)], closed: false }] })]));
    const p = paths(f)[0].paths[0];
    expect(p.closed).toBe(false);
    expect(p.points[0].c1).toBeUndefined();
    expect(p.points[1]).toMatchObject({ x: 20, y: 20, c1: { x: 10, y: 0 }, c2: { x: 20, y: 10 } });
    expect(p.points[2].c1).toBeUndefined();
  });

  it('closes a curve back to the first point on the first point', () => {
    const f = read(file([item({ subpaths: [{ anchors: [pt(0, 0, { in: [0, 5] }), pt(10, 0), pt(10, 10, { out: [10, 12] })], closed: true }] })]));
    const p = paths(f)[0].paths[0];
    expect(p.closed).toBe(true);
    expect(p.points[0].c1).toEqual({ x: 10, y: 12 });
    expect(p.points[0].c2).toEqual({ x: 0, y: 5 });
  });

  it('moves everything so the artboard corner is 0, 0, and keeps shapes that hang over the edge', () => {
    const f = read(file([item(rect(60, 60, 150, 110))], {}, { artboards: [{ id: 1, name: 'B', rect: { x0: 50, y0: 50, x1: 130, y1: 100 } }] }));
    expect(f.boards[0]).toMatchObject({ width: 80, height: 50 });
    expect(paths(f)[0].paths[0].points[0]).toMatchObject({ x: 10, y: 10 });
    expect(paths(f)[0].paths[0].points[2]).toMatchObject({ x: 100, y: 60 });
  });

  it('keeps lines: width, colour, round joins and caps, and a gradient line', () => {
    const f = read(file([item(rect(0, 0, 10, 10), { type: 'none' }, {}, solid(rgb(0, 0, 1)), 4), item(rect(0, 0, 10, 10), { type: 'none' }, {}, { type: 'gradient', gradient: { kind: 'Linear', stops: [{ offset: 0, color: rgb(1, 0, 0), opacity: 1 }, { offset: 1, color: rgb(0, 0, 1), opacity: 0.5 }] }, angle: 0 }, 3)]));
    const [a, b] = paths(f);
    expect(a.fill).toBeNull();
    expect(a.stroke).toMatchObject({ color: '#0000ff', width: 4, join: 'miter', cap: 'butt' });
    expect(b.strokeGradient?.stops.map((s) => s.color)).toEqual(['#ff0000', '#0000ff80']);
    expect(b.strokeGradient?.from.x).toBeLessThan(b.strokeGradient!.to.x);
  });

  it('turns a gradient angle into a direction, anticlockwise from the right', () => {
    const g = (angle: number) => read(file([item(rect(0, 0, 100, 100), { type: 'gradient', gradient: { kind: 'Linear', stops: [{ offset: 0, color: rgb(0, 0, 0), opacity: 1 }, { offset: 1, color: rgb(1, 1, 1), opacity: 1 }] }, angle })]));
    const right = paths(g(0))[0].fillGradient!;
    expect([right.from, right.to]).toEqual([{ x: 0, y: 50 }, { x: 100, y: 50 }]);
    const up = paths(g(90))[0].fillGradient!;
    expect(up.from.y).toBeCloseTo(100, 5);
    expect(up.to.y).toBeCloseTo(0, 5);
  });

  it('keeps more than one fill as the top one, and says so', () => {
    const f = read(file([{ id: 1, appearance: { items: [{ kind: 'fill', paint: solid(rgb(1, 0, 0)) }, { kind: 'fill', paint: solid(rgb(0, 1, 0)) }, { kind: 'stroke', paint: { type: 'none' }, width: 1 }] }, kind: { type: 'path', path: rect(0, 0, 5, 5) } }]));
    expect(paths(f)[0].fill).toBe('#00ff00');
    expect(f.left.join('\n')).toMatch(/more than one fill/);
  });

  it('turns greys, CMYK and HSB into screen colours, and says CMYK was converted', () => {
    expect(craftColor({ model: 'gray', k: 0 })).toMatchObject({ r: 255 });
    expect(craftColor({ model: 'gray', k: 1 })).toMatchObject({ r: 0 });
    expect(craftColor({ model: 'cmyk', c: 0, m: 1, y: 1, k: 0 })).toMatchObject({ r: 255, g: 0, b: 0, converted: 'CMYK' });
    expect(craftColor({ model: 'hsb', h: 120, s: 1, b: 1 })).toMatchObject({ r: 0, g: 255, b: 0 });
    expect(craftColor({ model: 'lab', l: 50 })).toBeNull();
    expect(craftColor('red')).toBeNull();
    const f = read(file([item(rect(0, 0, 5, 5), solid({ model: 'cmyk', c: 1, m: 0, y: 0, k: 0 })), item(rect(0, 0, 5, 5), solid({ model: 'lab', l: 5 }))]));
    expect(paths(f)[1].fill).toBe('#808080');
    expect(f.info.join('\n')).toMatch(/CMYK colours were turned into screen/);
    expect(f.left.join('\n')).toMatch(/colour model Frameling doesn't know/);
  });

  it('names what it cannot carry: pictures, unknown kinds of object, other effects, patterns, dashes, hidden objects', () => {
    const f = read(
      file([
        { id: 2, name: 'Photo', kind: { type: 'image', ref: 'img1' } },
        { id: 3, kind: { type: 'mesh' } },
        item(rect(0, 0, 5, 5), solid(rgb(1, 0, 0)), { appearance: { items: [{ kind: 'fill', paint: solid(rgb(1, 0, 0)) }], effects: [{ id: 'stylize.dropShadow', params: {}, visible: true }, { id: 'stylize.outerGlow', params: { blur: 5, color: '#ff0000', mode: 'normal', opacity: 50 }, visible: false }] } }),
        item(rect(0, 0, 5, 5), { type: 'pattern' }),
        item(rect(0, 0, 5, 5), { type: 'none' }, {}, solid(rgb(0, 0, 0)), 2),
        item(rect(0, 0, 5, 5), solid(rgb(0, 0, 1)), { visible: false }),
      ]),
    );
    const said = f.left.join('\n');
    expect(said).toMatch(/1 picture \("Photo"\)/);
    expect(said).toMatch(/1 object of a kind Frameling can't read \(mesh\)/);
    expect(said).toMatch(/1 effect \(stylize\.dropShadow\)/);
    expect(said).toMatch(/painted with a pattern/);
    expect(said).toMatch(/1 hidden object/);
    // The hidden glow was never counted as a loss, and the shapes that could be read are all here.
    expect(said).not.toMatch(/glow/);
    expect(paths(f).length).toBe(3);
  });

  it('keeps layers: names, nested layers after the one they sit in, hiding, opacity and locks; groups share a group id', () => {
    const f = read(
      file([
        item(rect(0, 0, 5, 5)),
        { id: 9, kind: { type: 'group', children: [item(rect(1, 1, 3, 3)), item(rect(2, 2, 4, 4))] } },
        { id: 10, name: 'Inner', visible: false, opacity: 0.5, locked: true, kind: { type: 'layer', children: [item(rect(5, 5, 6, 6))] } },
      ]),
    );
    expect(f.boards[0].layers.map((l) => [l.name, l.visible, l.opacity, l.locked, l.shapes.length])).toEqual([
      ['Layer 1', true, undefined, undefined, 3],
      ['Inner', false, 0.5, true, 1],
    ]);
    const s = paths(f);
    expect(s[0].group).toBeUndefined();
    expect(s[1].group).toBeDefined();
    expect(s[1].group).toBe(s[2].group);
  });

  it('keeps text: align, italic, all capitals, rotation, and says when it had more than one look', () => {
    const run = (text: string, style: Record<string, unknown>) => ({ text, style: { font_family: 'Inter', font_style: 'Bold Italic', size: 20, tracking: 0, h_scale: 100, v_scale: 100, rotation: 0, fill: solid(rgb(1, 0, 0)), stroke: { type: 'none' }, all_caps: true, underline: true, ...style } });
    const f = read(
      file([
        { id: 5, kind: { type: 'text', kind: { kind: 'area' }, xf: [0, 1, -1, 0, 10, 20], runs: [run('hi ', {}), run('there', { size: 40 })], para: { justify: 'Center' } } },
        { id: 6, kind: { type: 'text', xf: [1, 0, 0, 1, 0, 0], runs: [run('  ', {})] } },
      ]),
    );
    const t = shapesOf(f)[0] as TextShape;
    expect(shapesOf(f).length).toBe(1);
    expect([t.text, t.align, t.italic, t.weight, t.color]).toEqual(['HI THERE', 'center', true, 700, '#ff0000']);
    expect(t.transform.rotation).toBeCloseTo(90, 5);
    const said = f.left.join('\n');
    expect(said).toMatch(/more than one look/);
    expect(said).toMatch(/underline/);
    expect(said).toMatch(/inside a box/);
  });

  it('says a file is newer than it knows, and when it is not measured in points', () => {
    const f = read(file([item(rect(0, 0, 5, 5))], { version: 9 }, { units: 'Millimeters' }));
    expect(f.info.join('\n')).toMatch(/version 9, newer than version 4/);
    expect(f.info.join('\n')).toMatch(/millimeters.*one point to one pixel/);
  });

  it('turns bad numbers into a plain note, keeps what could be read, and refuses absurd positions', () => {
    const f = read(file([item({ subpaths: [{ anchors: [pt(0, 0), { p: ['x', 1] }, pt(10, 0), pt(1e12, 5), pt(10, 10)], closed: true }] })]));
    expect(paths(f)[0].paths[0].points.length).toBe(3);
    expect(f.left.join('\n')).toMatch(/points that don't make sense/);
  });

  it('refuses a file nested far too deep to be real, rather than overflowing the stack', () => {
    let inner: unknown = item(rect(0, 0, 5, 5));
    for (let i = 0; i < 80; i++) inner = { id: i, kind: { type: 'group', children: [inner] } };
    const f = read(file([item(rect(1, 1, 2, 2)), inner]));
    expect(f.left.join('\n')).toMatch(/levels deep/);
    expect(paths(f).length).toBe(1);
  });

  it('deduplicates swatches and keeps those in groups', () => {
    const sw = (name: string, c: unknown) => ({ name, paint: solid(c), global: false, spot: name === 'Spot' });
    const f = read(file([item(rect(0, 0, 5, 5))], {}, { swatches: [sw('A', rgb(1, 0, 0)), sw('A', rgb(1, 0, 0)), { name: '[None]', paint: { type: 'none' } }], swatch_groups: [{ name: 'G', swatches: [sw('Spot', rgb(0, 1, 0))] }] }));
    expect(f.swatches).toEqual([{ name: 'A', color: '#ff0000' }, { name: 'Spot', color: '#00ff00' }]);
    expect(f.info.join('\n')).toMatch(/1 spot colour came in as ordinary colours/);
  });

  it('describes bytes it does not know', () => {
    expect(describeBytes(new Uint8Array([0xff, 0xd8, 1]))).toMatch(/JPEG/);
    expect(describeBytes(text('%PDF-1.7'))).toBe('a PDF');
    expect(describeBytes(text('<html>'))).toMatch(/web or XML/);
  });
});

describe('VectorCraft artboards', () => {
  const two = () =>
    read(
      file(
        [item(rect(10, 10, 50, 50)), item(rect(210, 20, 260, 60)), item(rect(500, 500, 510, 510))],
        {},
        { artboards: [{ id: 1, name: 'Front', rect: { x0: 0, y0: 0, x1: 100, y1: 100 } }, { id: 2, name: 'Back', rect: { x0: 200, y0: 0, x1: 300, y1: 100 } }] },
      ),
    );

  it('puts each shape on the artboard it sits in, measured from that artboard\'s corner, and says what sat outside', () => {
    const f = two();
    expect(f.boards.map((b) => [b.name, b.x, b.y, b.width, b.height])).toEqual([['Front', 0, 0, 100, 100], ['Back', 200, 0, 100, 100]]);
    expect(paths(f, 0)[0].paths[0].points[0]).toMatchObject({ x: 10, y: 10 });
    expect(paths(f, 1)[0].paths[0].points[0]).toMatchObject({ x: 10, y: 20 });
    expect(f.left.join('\n')).toMatch(/1 shape that sit outside every artboard/);
  });

  it('becomes a document with an artboard for each, in the places they had, the first one open', () => {
    const { doc } = craftDoc(two(), 'Two');
    expect(doc.artboards?.map((a) => [a.name, a.x, a.y])).toEqual([['Front', 0, 0], ['Back', 200, 0]]);
    expect(doc.activeArtboard).toBe(doc.artboards![0].id);
    expect([doc.width, doc.height]).toEqual([100, 100]);
    const back = doc.artboards![1];
    expect([back.content?.width, back.content?.height, back.content?.layers.length]).toEqual([100, 100, 1]);
    // Every layer's drawing is in the document.
    for (const l of [...doc.layers, ...back.content!.layers]) for (const c of l.cels) expect(doc.drawings[c.drawingId]).toBeDefined();
  });

  it('scales every artboard by one number when they are bigger than a drawing can be', () => {
    const f = read(file([item(rect(0, 0, 8000, 100)), item(rect(9000, 0, 9100, 100))], {}, { artboards: [{ id: 1, name: 'A', rect: { x0: 0, y0: 0, x1: 8192, y1: 100 } }, { id: 2, name: 'B', rect: { x0: 8500, y0: 0, x1: 9500, y1: 100 } }] }));
    const k = craftScale(f);
    expect(k).toBeCloseTo(0.5, 5);
    const { doc, scale } = craftDoc(f, 'Wide');
    expect(scale).toBeCloseTo(0.5, 5);
    expect(doc.width).toBe(4096);
    expect(doc.artboards![1].x).toBe(Math.round(8500 * 0.5));
  });
});
