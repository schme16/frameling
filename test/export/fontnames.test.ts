import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { facesOfTables, pickFace, readFontFaces, readNames, validPsName, type FontFace } from '../../src/fonts/fontnames';
import { SHIPPED_FACES } from '../../src/fonts/psnames-shipped';
import { forgetFontNames, learnFontNames, liveFontName, textFontsIn } from '../../src/export/ai-fonts';

// A tiny font file made by hand: only the tables the reader looks at.
function u16(n: number) {
  return [(n >> 8) & 255, n & 255];
}
function u32(n: number) {
  return [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function nameTable(names: Record<number, string>, mac = false): number[] {
  const ids = Object.keys(names).map(Number).sort((a, b) => a - b);
  const strings: number[] = [];
  const recs: number[] = [];
  for (const id of ids) {
    const s = names[id];
    const bytes = mac ? [...s].map((c) => c.charCodeAt(0)) : [...s].flatMap((c) => u16(c.charCodeAt(0)));
    recs.push(...u16(mac ? 1 : 3), ...u16(mac ? 0 : 1), ...u16(mac ? 0 : 0x409), ...u16(id), ...u16(bytes.length), ...u16(strings.length));
    strings.push(...bytes);
  }
  return [...u16(0), ...u16(ids.length), ...u16(6 + ids.length * 12), ...recs, ...strings];
}
function os2(weight: number, sel: number): number[] {
  const t = new Array(96).fill(0);
  t.splice(4, 2, ...u16(weight));
  t.splice(62, 2, ...u16(sel));
  return t;
}
function fvar(axes: string[], instances: { name: number; coords: number[]; ps?: number }[]): number[] {
  const axisSize = 20;
  const size = 4 + axes.length * 4 + 2;
  const out = [...u16(1), ...u16(0), ...u16(16), ...u16(2), ...u16(axes.length), ...u16(axisSize), ...u16(instances.length), ...u16(size)];
  for (const a of axes) out.push(...[...a].map((c) => c.charCodeAt(0)), ...u32(100 << 16), ...u32(400 << 16), ...u32(900 << 16), ...u16(0), ...u16(256));
  for (const i of instances) out.push(...u16(i.name), ...u16(0), ...i.coords.flatMap((c) => u32(c << 16)), ...u16(i.ps ?? 0xffff));
  return out;
}
function sfnt(tables: Record<string, number[]>, tag = [0, 1, 0, 0]): Uint8Array {
  const tags = Object.keys(tables);
  const head = [...tag, ...u16(tags.length), ...u16(0), ...u16(0), ...u16(0)];
  let at = 12 + tags.length * 16;
  const dir: number[] = [];
  const body: number[] = [];
  for (const t of tags) {
    const d = tables[t];
    dir.push(...[...t].map((c) => c.charCodeAt(0)), ...u32(0), ...u32(at + body.length), ...u32(d.length));
    body.push(...d, ...new Array((4 - (d.length % 4)) % 4).fill(0));
  }
  void at;
  return Uint8Array.from([...head, ...dir, ...body]);
}

describe('readNames', () => {
  it('reads Windows names and keeps the English one', () => {
    const t = Uint8Array.from(nameTable({ 1: 'Demo Sans', 6: 'DemoSans-Bold' }));
    expect(readNames(t).get(6)).toBe('DemoSans-Bold');
    expect(readNames(t).get(1)).toBe('Demo Sans');
  });
  it('reads old Mac names', () => {
    const t = Uint8Array.from(nameTable({ 6: 'DemoSans-Bold' }, true));
    expect(readNames(t).get(6)).toBe('DemoSans-Bold');
  });
  it('survives a broken table', () => {
    expect(readNames(Uint8Array.from([0, 0, 0, 200, 0, 0])).size).toBe(0);
  });
});

describe('readFontFaces', () => {
  it('gets family, style, PostScript name, weight and slant from a font file', () => {
    const f = sfnt({ name: nameTable({ 1: 'Demo Sans', 2: 'Bold Italic', 6: 'DemoSans-BoldItalic' }), 'OS/2': os2(700, 1) });
    expect(readFontFaces(f)).toEqual([{ family: 'Demo Sans', style: 'Bold Italic', ps: 'DemoSans-BoldItalic', weight: 700, italic: true }]);
  });
  it('prefers the typographic family and style (names 16 and 17)', () => {
    const f = sfnt({ name: nameTable({ 1: 'Demo Sans Light', 2: 'Regular', 6: 'DemoSans-Light', 16: 'Demo Sans', 17: 'Light' }), 'OS/2': os2(300, 0) });
    expect(readFontFaces(f)[0]).toMatchObject({ family: 'Demo Sans', style: 'Light', weight: 300, italic: false });
  });
  it('turns to the head table for the slant when there is no OS/2', () => {
    const head = new Array(54).fill(0);
    head.splice(44, 2, ...u16(3));
    const f = sfnt({ name: nameTable({ 1: 'Old', 6: 'Old-BoldItalic' }), head });
    expect(readFontFaces(f)[0]).toMatchObject({ weight: 700, italic: true });
  });
  it('reads every font of a collection', () => {
    const a = sfnt({ name: nameTable({ 1: 'One', 6: 'One-Regular' }), 'OS/2': os2(400, 0) });
    const b = sfnt({ name: nameTable({ 1: 'Two', 6: 'Two-Regular' }), 'OS/2': os2(400, 0) });
    // A collection: header, two offsets, then the two fonts with their table offsets moved to match.
    const shift = (f: Uint8Array, by: number) => {
      const c = Uint8Array.from(f);
      const dv = new DataView(c.buffer);
      for (let i = 0; i < dv.getUint16(4); i++) dv.setUint32(12 + i * 16 + 8, dv.getUint32(12 + i * 16 + 8) + by);
      return c;
    };
    const base = 20;
    const aS = shift(a, base);
    const bS = shift(b, base + a.length);
    const file = Uint8Array.from([...'ttcf'].map((c) => c.charCodeAt(0)).concat(u32(0x10000), u32(2), u32(base), u32(base + a.length), ...aS, ...bS));
    expect(readFontFaces(file).map((f) => f.ps)).toEqual(['One-Regular', 'Two-Regular']);
  });
  it('gives each named style of a variable font its own name', () => {
    const f = sfnt({
      name: nameTable({ 1: 'Demo Variable', 6: 'DemoVariable-Regular', 16: 'Demo Variable', 17: 'Regular', 25: 'Demo', 256: 'Regular', 257: 'Bold', 258: 'Black', 300: 'Demo-Black' }),
      'OS/2': os2(400, 0),
      fvar: fvar(['wght'], [
        { name: 256, coords: [400] },
        { name: 257, coords: [700] },
        { name: 258, coords: [900], ps: 300 },
      ]),
    });
    expect(readFontFaces(f).map((x) => [x.family, x.ps, x.weight])).toEqual([
      ['Demo', 'Demo-Regular', 400],
      ['Demo', 'Demo-Bold', 700],
      ['Demo', 'Demo-Black', 900],
    ]);
  });
  it('gives nothing for a file that is not a font or has no usable PostScript name', () => {
    expect(readFontFaces(Uint8Array.from([1, 2, 3]))).toEqual([]);
    expect(readFontFaces(new Uint8Array(100))).toEqual([]);
    expect(readFontFaces(sfnt({ name: nameTable({ 1: 'Bad', 6: 'Bad Name(1)' }) }))).toEqual([]);
  });
  it('checks what a PostScript name may hold', () => {
    expect(validPsName('Arial-BoldMT')).toBe(true);
    expect(validPsName('Has Space')).toBe(false);
    expect(validPsName('a/b')).toBe(false);
    expect(validPsName('x'.repeat(64))).toBe(false);
    expect(validPsName(undefined)).toBe(false);
  });
  it('reads a WOFF2 file with a Brotli decompressor', () => {
    const path = 'node_modules/@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2';
    if (!existsSync(path)) return;
    const faces = readFontFaces(new Uint8Array(readFileSync(path)), (d) => new Uint8Array(brotliDecompressSync(d)));
    expect(faces.find((f) => f.weight === 800)?.ps).toBe('Nunito-ExtraBold');
    expect(readFontFaces(new Uint8Array(readFileSync(path)))).toEqual([]);
  });
});

describe('pickFace', () => {
  const face = (family: string, weight: number, italic: boolean, ps: string): FontFace => ({ family, style: '', weight, italic, ps });
  const faces = [face('Demo Sans', 400, false, 'R'), face('Demo Sans', 700, false, 'B'), face('Demo Sans', 400, true, 'I'), face('Other', 400, false, 'O')];
  it('matches the family without case or spaces, then slant, then the nearest weight', () => {
    expect(pickFace(faces, 'demosans', 400, false)?.ps).toBe('R');
    expect(pickFace(faces, 'Demo Sans', 600, false)?.ps).toBe('B');
    expect(pickFace(faces, 'Demo Sans', 500, false)?.ps).toBe('R');
    expect(pickFace(faces, 'Demo Sans', 700, true)?.ps).toBe('I');
  });
  it('is null for a family that is not there', () => {
    expect(pickFace(faces, 'Nope', 400, false)).toBeNull();
  });
  it('keeps a slant it has over a weight it has not', () => {
    expect(pickFace(faces, 'Demo Sans', 900, true)?.ps).toBe('I');
  });
});

describe('the fonts Frameling ships', () => {
  it('have their real names in the table', () => {
    expect(pickFace(SHIPPED_FACES, 'Nunito', 800, false)?.ps).toBe('Nunito-ExtraBold');
    expect(pickFace(SHIPPED_FACES, 'Inter', 700, true)?.ps).toBe('Inter-BoldItalic');
  });
  it('match their font files (run `node scripts/gen-psnames.mjs` after updating them)', () => {
    if (!existsSync('node_modules/@fontsource-variable/nunito/files')) return;
    expect(spawnSync('node', ['scripts/gen-psnames.mjs', '--check']).status).toBe(0);
  });
});

describe('liveFontName', () => {
  afterEach(() => {
    forgetFontNames();
    delete (globalThis as { window?: unknown }).window;
  });
  it('uses the shipped names, then the guess', () => {
    expect(liveFontName('Nunito', 800, false)).toBe('Nunito-ExtraBold');
    expect(liveFontName('Source Sans Pro', 300, false)).toBe('SourceSansPro-Light');
    expect(liveFontName('Arial', 700, false)).toBe('Arial-BoldMT');
  });
  it('finds the text fonts in a document', () => {
    const doc = { layers: [{ shapes: [{ type: 'text', font: 'Arial', weight: 700 }, { type: 'text', font: 'Arial', weight: 700, italic: false }, { type: 'text', font: 'Nunito', weight: 400, italic: true }, { type: 'rect' }], px: new Uint8Array(4) }] };
    expect(textFontsIn(doc)).toEqual([
      { family: 'Arial', weight: 700, italic: false },
      { family: 'Nunito', weight: 400, italic: true },
    ]);
  });
  it('takes the names the desktop side read, and keeps the guess where it had none', async () => {
    const asked: unknown[] = [];
    (globalThis as { window?: unknown }).window = {
      frameling: { files: {}, fonts: { psNames: async (w: { family: string }[]) => (asked.push(w), w.map((x) => (x.family === 'Quirky' ? 'Quirky-RealName' : null))) } },
    };
    const doc = { shapes: [{ type: 'text', font: 'Quirky', weight: 400 }, { type: 'text', font: 'Nunito', weight: 400 }] };
    await learnFontNames(doc);
    expect(liveFontName('Quirky', 400, false)).toBe('Quirky-RealName');
    expect(liveFontName('Nunito', 400, false)).toBe('Nunito-Regular');
    await learnFontNames(doc);
    expect(asked).toHaveLength(1);
  });
  it('keeps the guess when there is no desktop side (the web version)', async () => {
    await learnFontNames({ shapes: [{ type: 'text', font: 'Quirky', weight: 400 }] });
    expect(liveFontName('Quirky', 400, false)).toBe('Quirky-Regular');
  });
});
