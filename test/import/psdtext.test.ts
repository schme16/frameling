import { describe, expect, it } from 'vitest';
import { layeredPieces } from '../../src/import/layered/build';
import type { GroupNode, LayeredFile, RasterNode, TextNode } from '../../src/import/layered/model';
import { readLayered } from '../../src/import/layered/read';
import { readPsd } from '../../src/import/layered/psd';
import { breakParagraph, fontKind, nearestFont, psFont, settleText, type FontEnv } from '../../src/import/layered/psdfonts';
import { pictureReason } from '../../src/import/layered/psdtext';
import { parseEngine, parseTypeBlock, type PsdType } from '../../src/import/layered/psdtype';
import { centreOn } from '../../src/import/pieces';
import type { TextShape, VectorDrawing } from '../../src/core/format';
import { buildPsd, runStyle, solid, typeBlock, typeLayer, type TestLayer } from './psdBuilder';

const file = (layers: TestLayer[], w = 200, h = 100) => readPsd(buildPsd({ width: w, height: h, layers }));
const textOf = (f: LayeredFile, i = 0) => {
  const n = f.nodes[i];
  if (n.type !== 'text') throw new Error(`a text node was expected, got ${n.type}`);
  return n as TextNode;
};
/** Every font is here, and every letter is 10 wide: simple to count lines by. */
const env = (has: (f: string) => boolean = () => true): FontEnv => ({ has, measure: (t) => t.length * 10 });
/** One style for all the words: a font and a size. */
const plain = (size: number, extra: Parameters<typeof runStyle>[0] = { size }) => [{ length: 100, style: runStyle({ ...extra, size }) }];

describe('reading the type block', () => {
  it('reads the words, runs, fonts, sizes, colours and spacing from the descriptor and the engine data', () => {
    const t = parseTypeBlock(typeBlock({ transform: [2, 0, 0, 2, 100, 60] }))!;
    expect(t.text).toBe('Hello\nWorld');
    expect(t.runs.map((r) => [r.text, r.font, r.size, r.color, r.tracking, r.fauxBold, r.underline])).toEqual([
      ['Hello\n', 'Montserrat-SemiBold', 20, '#ff0000', 0, false, false],
      ['World', 'SomeCustomFont-Italic', 30, '#0000ff', 100, true, true],
    ]);
    expect(t.transform).toEqual([2, 0, 0, 2, 100, 60]);
    expect([t.paragraph, t.align, t.warped, t.vertical, t.onPath]).toEqual([false, 'left', false, false, false]);
  });

  it('reads paragraph boxes, alignment and explicit leading', () => {
    const t = parseTypeBlock(typeBlock({ shapeType: 1, box: [0, 0, 300, 100], justification: 2, text: 'Hi\r', runs: [{ length: 3, style: '/FontSize 10 /AutoLeading false /Leading 24' }] }))!;
    expect([t.paragraph, t.box, t.align]).toEqual([true, [0, 0, 300, 100], 'center']);
    expect(t.runs[0].leading).toBe(24);
  });

  it('gives null for damaged blocks, and reads engine strings with escapes', () => {
    expect(parseTypeBlock(new Uint8Array(4))).toBeNull();
    expect(parseTypeBlock(typeBlock({ noEngine: true }))).toBeNull();
    expect(parseTypeBlock(typeBlock().subarray(0, 80))).toBeNull();
    expect(parseEngine(new TextEncoder().encode('/A << /B [ 1 2.5 -3 ] /C (\\(hi\\)) /D true >>'))).toEqual({ A: { B: [1, 2.5, -3], C: '(hi)', D: true } });
    expect(parseEngine(new TextEncoder().encode('<< /A << '))).toBeNull();
  });

  it('says why a layer has to stay a picture', () => {
    const base = parseTypeBlock(typeBlock())!;
    expect(pictureReason(base)).toBeNull();
    expect(pictureReason({ ...base, warped: true })).toBe('warped');
    expect(pictureReason({ ...base, vertical: true })).toBe('vertical');
    expect(pictureReason({ ...base, onPath: true })).toBe('path');
  });
});

describe('a PSD text layer becomes text', () => {
  it('keeps the words, font, size, colour, tracking and alignment, at the anchor', () => {
    const f = file([typeLayer('Title', { text: 'Hello\rWorld\r', transform: [2, 0, 0, 2, 100, 60], runs: plain(20, { size: 20, color: [1, 0.5, 0], tracking: 50, fauxBold: true, leading: 30 }), fonts: ['Montserrat-Light'], justification: 2 })]);
    expect(f.nodes).toHaveLength(1);
    const t = textOf(f);
    expect(t).toMatchObject({ type: 'text', name: 'Title', text: 'Hello\nWorld', font: 'Montserrat', weight: 700, italic: false, size: 40, color: '#ff8000', align: 'center', x: 100, y: 60, rotation: 0, scaleX: 1 });
    // 50/1000 em of 40 px, and 30 pt leading on a 20 pt size
    expect(t.letterSpacing).toBe(2);
    expect(t.lineHeight).toBe(1.5);
    expect(t.fontFile).toBe('Montserrat-Light');
  });

  it('does not decode the picture of a text layer it can bring in as words', () => {
    const f = file([typeLayer('Title', {}, { top: 0, left: 0, bottom: 0, right: 0, channels: [] })]);
    expect(textOf(f).name).toBe('Title');
  });

  it('reads the family, weight and slant from the font name', () => {
    expect(psFont('Montserrat-SemiBoldItalic')).toMatchObject({ family: 'Montserrat', weight: 600, italic: true });
    expect(psFont('OpenSans-ExtraBold')).toMatchObject({ family: 'Open Sans', weight: 800 });
    expect(psFont('SourceSansPro-Semibold')).toMatchObject({ family: 'Source Sans Pro', weight: 600 });
    expect(psFont('ArialMT')).toMatchObject({ family: 'Arial', weight: 400, italic: false });
    expect(psFont('TimesNewRomanPS-BoldItalicMT')).toMatchObject({ family: 'Times New Roman', weight: 700, italic: true });
    expect(psFont('CenturyGothic-Bold')).toMatchObject({ family: 'Century Gothic', weight: 700 });
    expect(psFont('ComicSansMS')).toMatchObject({ family: 'Comic Sans MS', weight: 400 });
    expect(psFont('IBMPlexSans-Medium')).toMatchObject({ family: 'IBM Plex Sans', weight: 500 });
    expect(psFont('DejaVuSans-Bold')).toMatchObject({ family: 'DejaVu Sans', weight: 700 });
    expect(psFont('Foo-Regular', true, false).weight).toBe(700);
    expect(psFont('Foo-Regular', false, true).italic).toBe(true);
    expect(psFont('').family).toBe('Sans-serif');
  });

  it('scales the size by the layer\'s transform, stretches across, and keeps the turn', () => {
    const turned = textOf(file([typeLayer('Turned', { transform: [0, 1, -1, 0, 50, 40], runs: plain(10) })]));
    expect(turned).toMatchObject({ rotation: 90, size: 10, x: 50, y: 40 });
    const wide = textOf(file([typeLayer('Wide', { transform: [3, 0, 0, 1.5, 0, 0], runs: plain(10) })]));
    expect(wide).toMatchObject({ size: 15, scaleX: 2 });
    const tilted = textOf(file([typeLayer('Tilted', { transform: [0.98, -0.19, 0.19, 0.98, 107.31, 68.6], runs: plain(18) })]));
    expect(tilted.rotation).toBeCloseTo(-10.97, 1);
  });

  it('hangs paragraph text from the top of its box, by the left, middle or right edge', () => {
    const left = textOf(file([typeLayer('P', { shapeType: 1, box: [0, 0, 300, 100], transform: [1, 0, 0, 1, 50, 40], runs: plain(20) })]));
    expect(left).toMatchObject({ x: 50, align: 'left', wrap: 300 });
    expect(left.y).toBeCloseTo(40 + 20 * 0.71, 5);
    const centre = textOf(file([typeLayer('P', { shapeType: 1, box: [0, 0, 300, 100], transform: [1, 0, 0, 1, 50, 40], justification: 2, runs: plain(20) })]));
    expect(centre.x).toBe(200);
    const right = textOf(file([typeLayer('P', { shapeType: 1, box: [0, 0, 300, 100], transform: [1, 0, 0, 1, 50, 40], justification: 1, runs: plain(20) })]));
    expect(right.x).toBe(350);
    // turned a quarter, the box's top edge runs down the page
    const turned = textOf(file([typeLayer('P', { shapeType: 1, box: [0, 0, 300, 100], transform: [0, 1, -1, 0, 50, 40], runs: plain(20) })]));
    expect(turned.x).toBeCloseTo(50 - 20 * 0.71, 5);
    expect(turned.y).toBeCloseTo(40, 5);
  });

  it('carries visibility, opacity, fill opacity, blend and clipping to the text', () => {
    const f = file([typeLayer('T', {}, { hidden: true, opacity: 128, blend: 'mul ', clipping: true })]);
    const t = textOf(f);
    expect(t).toMatchObject({ hidden: true, blend: 'multiply', clip: true });
    expect(t.opacity).toBeCloseTo(128 / 255, 5);
  });

  it('types all capitals out, and uses the longest style for the whole text', () => {
    const f = file([
      typeLayer('Caps', { text: 'make it loud\r', runs: plain(20, { size: 20, caps: 2 }) }),
      typeLayer('Mixed', { text: 'Big small\r', runs: [{ length: 4, style: runStyle({ size: 40, font: 0 }) }, { length: 6, style: runStyle({ size: 12, font: 1, color: [1, 0, 0] }) }] }),
    ]);
    expect(textOf(f, 0).text).toBe('MAKE IT LOUD');
    const mixed = textOf(f, 1);
    expect(mixed).toMatchObject({ size: 12, font: 'Some Custom Font', italic: true, color: '#ff0000' });
    const s = f.left.join('\n');
    expect(s).toMatch(/All capitals on 1 text layer \("Caps"\)/);
    expect(s).toMatch(/1 text layer \("Mixed"\) mixed more than one font, size or colour .* uses the style of the longest part/);
  });
});

describe('what a text shape cannot hold is said, by name', () => {
  it('counts underline, strikethrough, small capitals and justified text', () => {
    const f = file([
      typeLayer('Under', { runs: plain(10, { size: 10, underline: true }) }),
      typeLayer('Under 2', { runs: plain(10, { size: 10, underline: true }) }),
      typeLayer('Struck', { runs: plain(10, { size: 10, strike: true }) }),
      typeLayer('Small', { runs: plain(10, { size: 10, caps: 1 }) }),
      typeLayer('Justified', { justification: 3, runs: plain(10) }),
    ]);
    expect(f.nodes.every((n) => n.type === 'text')).toBe(true);
    expect(textOf(f, 4).align).toBe('left');
    const s = f.left.join('\n');
    expect(s).toMatch(/Underlined words on 2 text layers \("Under", "Under 2"\)/);
    expect(s).toMatch(/Struck-through words on 1 text layer \("Struck"\)/);
    expect(s).toMatch(/Small capitals on 1 text layer \("Small"\)/);
    expect(s).toMatch(/1 text layer \("Justified"\) had both edges straight/);
  });

  it('keeps warped, vertical, masked and unreadable text as the picture of the words, and says why', () => {
    const f = file([
      typeLayer('Bent', { warp: true }),
      typeLayer('Tall', { vertical: true }),
      typeLayer('Masked', {}, { mask: { top: 4, left: 8, bottom: 6, right: 12, def: 255, plane: new Uint8Array(8).fill(255) } }),
      typeLayer('Broken', { noEngine: true }),
    ]);
    expect(f.nodes.map((n) => n.type)).toEqual(['layer', 'layer', 'layer', 'layer']);
    const s = f.left.join('\n');
    expect(s).toMatch(/1 text layer \("Bent"\) is warped .* came in as a picture of the words/);
    expect(s).toMatch(/1 text layer \("Tall"\) runs top to bottom/);
    expect(s).toMatch(/1 text layer \("Masked"\) has a layer mask over it/);
    expect(s).toMatch(/1 text layer \("Broken"\) has text settings Frameling couldn't read/);
    expect(raster(f.nodes[0]).width).toBe(4);
  });

  it('names several layers of one kind in one sentence', () => {
    const f = file([typeLayer('A', { warp: true }), typeLayer('B', { warp: true })]);
    expect(f.left.filter((l) => /warped/.test(l))).toHaveLength(1);
    expect(f.left.join(' ')).toMatch(/2 text layers \("A", "B"\) are warped/);
  });
});

const raster = (n: unknown) => n as RasterNode;

describe('fonts that are not on this computer', () => {
  it('sorts fonts into the kinds the nearest one is picked from', () => {
    expect(fontKind('Times New Roman')).toBe('serif');
    expect(fontKind('Georgia')).toBe('serif');
    expect(fontKind('Noto Sans')).toBe('sans');
    expect(fontKind('Source Sans Pro')).toBe('sans');
    expect(fontKind('Courier New')).toBe('mono');
    expect(fontKind('Comic Sans MS')).toBe('friendly');
    expect(fontKind('Century Gothic')).toBe('sans');
    expect(fontKind('Merriweather')).toBe('serif');
  });

  it('picks the nearest font that is here, and a Frameling one when nothing else is', () => {
    expect(nearestFont('Century Gothic', () => false)).toBe('Inter');
    expect(nearestFont('Century Gothic', (f) => f === 'Inter')).toBe('Inter');
    expect(nearestFont('Garamond-Bold', (f) => f === 'Liberation Serif')).toBe('Liberation Serif');
    expect(nearestFont('Garamond-Bold', () => false)).toBe('Inter');
    expect(nearestFont('Consolas', (f) => f === 'DejaVu Sans Mono')).toBe('DejaVu Sans Mono');
    expect(nearestFont('ComicSansMS', () => false)).toBe('Nunito');
  });

  it('names the font plainly, uses the nearest one and keeps the text', () => {
    const f = file([
      typeLayer('Title', { fonts: ['CenturyGothic-Bold'], runs: plain(20) }),
      typeLayer('Sub', { fonts: ['CenturyGothic-Bold'], runs: plain(12) }),
      typeLayer('Body', { fonts: ['Georgia'], runs: plain(12) }),
      typeLayer('Nice', { fonts: ['Inter-Regular'], runs: plain(12) }),
    ]);
    settleText(f, env((fam) => fam === 'Georgia'));
    expect(f.nodes.map((n) => (n as TextNode).font)).toEqual(['Inter', 'Inter', 'Georgia', 'Inter']);
    expect(f.nodes.every((n) => n.type === 'text')).toBe(true);
    const s = f.left.filter((l) => /not on this computer/.test(l));
    expect(s).toHaveLength(1);
    expect(s[0]).toBe('The font "Century Gothic" is not on this computer, so 2 text layers ("Title", "Sub") use Inter instead. Install the font, then choose it in the text options to get the look back.');
  });

  it('says nothing when every font is here', () => {
    const f = file([typeLayer('Title', { fonts: ['Georgia'], runs: plain(20) })]);
    settleText(f, env());
    expect(f.left.filter((l) => /not on this computer/.test(l))).toEqual([]);
  });

  it('reads a file end to end, with the fonts settled and the words kept', async () => {
    const bytes = buildPsd({ width: 200, height: 100, layers: [typeLayer('Title', { fonts: ['Gotham-Bold'], runs: plain(20) })] });
    const f = await readLayered(bytes, 'a.psd');
    expect(textOf(f).font).toBe('Inter');
    expect(f.left.join(' ')).toMatch(/The font "Gotham" is not on this computer/);
  });
});

describe('paragraph text is broken where the box broke it', () => {
  const node = { text: 'one two three four five', font: 'Inter', weight: 400, italic: false, size: 10, letterSpacing: 0 };
  it('breaks at the box width, keeping the lines you typed', () => {
    expect(breakParagraph({ ...node, wrap: 90 }, (t) => t.length * 10)).toBe('one two\nthree\nfour five');
    expect(breakParagraph({ ...node, text: 'a b\nc d e', wrap: 40 }, (t) => t.length * 10)).toBe('a b\nc d\ne');
    expect(breakParagraph({ ...node, text: 'unbreakable', wrap: 30 }, (t) => t.length * 10)).toBe('unbreakable');
  });

  it('counts the space between letters', () => {
    expect(breakParagraph({ ...node, letterSpacing: 10, wrap: 80 }, (t) => t.length * 10)).toBe('one\ntwo\nthree\nfour\nfive');
  });

  it('wraps while settling a file, and says so', () => {
    const f = file([typeLayer('Box', { text: 'one two three four five\r', shapeType: 1, box: [0, 0, 90, 100], runs: plain(10) })]);
    settleText(f, env());
    expect(textOf(f).text).toBe('one two\nthree\nfour five');
    expect(f.info.join(' ')).toMatch(/1 text layer had a box the words wrapped in/);
    const wide = file([typeLayer('Box', { text: 'one two\r', shapeType: 1, box: [0, 0, 800, 100], runs: plain(10) })]);
    settleText(wide, env());
    expect(wide.info).toEqual([]);
  });
});

describe('text on the way in', () => {
  const sample = () => {
    const f = file([typeLayer('Back', { warp: true }), typeLayer('Title', { transform: [1, 0, 0, 1, 40, 30], runs: plain(20, { size: 20, tracking: 100 }) }, { hidden: true, opacity: 128, clipping: true })]);
    settleText(f, env());
    return f;
  };

  it('is a vector layer with one text shape, with the layer\'s own settings', () => {
    const p = layeredPieces(sample());
    expect(p.layers.map((l) => [l.kind, l.name])).toEqual([['pixel', 'Back'], ['vector', 'Title']]);
    const layer = p.layers[1];
    expect(layer).toMatchObject({ visible: false, clipToBelow: true });
    expect(layer.opacity).toBeCloseTo(128 / 255, 5);
    const d = p.drawings[layer.cels[0].drawingId] as VectorDrawing;
    expect(d.kind).toBe('vector');
    const s = d.shapes[0] as TextShape;
    expect(s).toMatchObject({ type: 'text', font: 'Montserrat', size: 20, color: '#000000', align: 'left', letterSpacing: 2, opacity: 1 });
    expect(s.transform).toEqual({ x: 40, y: 30, scaleX: 1, scaleY: 1, rotation: 0, skew: 0 });
    expect(layer.cels[0].length).toBeGreaterThan(0);
  });

  it('keeps its place when a folder holds it', () => {
    const f: LayeredFile = { ...sample(), nodes: [{ type: 'group', name: 'F', hidden: false, opacity: 1, blend: 'normal', children: sample().nodes } as GroupNode] };
    const p = layeredPieces(f);
    expect(Object.values(p.folders)).toHaveLength(1);
    expect(p.layers.every((l) => l.folder === Object.keys(p.folders)[0])).toBe(true);
  });

  it('moves with the picture when it is added to a bigger drawing', () => {
    const p = layeredPieces(sample());
    const { pieces } = centreOn(p, { width: 400, height: 300 });
    const layer = pieces.layers[1];
    const s = (pieces.drawings[layer.cels[0].drawingId] as VectorDrawing).shapes[0] as TextShape;
    expect(s.transform.x).toBe(40 + 100);
    expect(s.transform.y).toBe(30 + 100);
    expect(Object.values(pieces.drawings).filter((d) => d.kind === 'vector')).toHaveLength(1);
  });
});

describe('a mask on a folder', () => {
  it('is said, since a Frameling folder has none', () => {
    const f = file([
      { name: '</Layer group>', section: 3 },
      { name: 'Inside', top: 0, left: 0, bottom: 2, right: 2, channels: solid(2, 2, 5, 5, 5) },
      { name: 'Masked folder', section: 1, mask: { top: 0, left: 0, bottom: 2, right: 2, def: 0, plane: new Uint8Array(4).fill(255) } },
    ]);
    expect(f.left.join(' ')).toMatch(/A layer mask on 1 folder \("Masked folder"\) was not applied/);
  });
});
