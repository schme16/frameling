import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { cmykToRgb, isAdobeSwatches, labToRgb, parseAdobeSwatches } from '../../src/pixel/ase-swatches';
import { PaletteProblem } from '../../src/pixel/palette-io';
import { loadFile, saveFile } from '../../src/io/file';
import { newDoc } from '../../src/core/doc';
import { insertColor, moveColor, removeColor, toggleRampStart } from '../../src/pixel/palette';

class B {
  private a: number[] = [];
  u16(n: number) {
    this.a.push((n >> 8) & 255, n & 255);
    return this;
  }
  u32(n: number) {
    this.a.push((n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255);
    return this;
  }
  f32(v: number) {
    const d = new DataView(new ArrayBuffer(4));
    d.setFloat32(0, v);
    this.a.push(d.getUint8(0), d.getUint8(1), d.getUint8(2), d.getUint8(3));
    return this;
  }
  str(s: string) {
    this.u16(s.length + 1);
    for (const c of s) this.u16(c.charCodeAt(0));
    return this.u16(0);
  }
  tag(s: string) {
    for (const c of s) this.a.push(c.charCodeAt(0));
    return this;
  }
  bytes(b: number[]) {
    this.a.push(...b);
    return this;
  }
  get out() {
    return Uint8Array.from(this.a);
  }
  get size() {
    return this.a.length;
  }
}

type Block = { group: string } | { end: true } | { name: string; model: 'RGB ' | 'CMYK' | 'LAB ' | 'Gray' | 'XXXX'; v: number[] };

function swatches(blocks: Block[]): Uint8Array {
  const body = new B();
  for (const b of blocks) {
    const inner = new B();
    if ('end' in b) body.u16(0xc002).u32(0);
    else if ('group' in b) {
      inner.str(b.group);
      body.u16(0xc001).u32(inner.size).bytes([...inner.out]);
    } else {
      inner.str(b.name).tag(b.model);
      for (const v of b.v) inner.f32(v);
      inner.u16(2);
      body.u16(0x0001).u32(inner.size).bytes([...inner.out]);
    }
  }
  return new B().tag('ASEF').u16(1).u16(0).u32(blocks.length).bytes([...body.out]).out;
}

describe('Adobe swatch files', () => {
  it('knows its magic', () => {
    expect(isAdobeSwatches(Uint8Array.from([0x41, 0x53, 0x45, 0x46, 0, 1, 0, 0, 0, 0, 0, 0]))).toBe(true);
    // An Aseprite sprite starts with its size, then 0xA5E0.
    expect(isAdobeSwatches(Uint8Array.from([0x5e, 1, 0, 0, 0xe0, 0xa5, 1, 0, 0, 0, 0, 0]))).toBe(false);
  });

  it('reads RGB, CMYK, Gray and LAB as sRGB, with names', () => {
    const r = parseAdobeSwatches(
      swatches([
        { name: 'Red', model: 'RGB ', v: [1, 0, 0] },
        { name: 'Cyan ink', model: 'CMYK', v: [1, 0, 0, 0] },
        { name: 'Black ink', model: 'CMYK', v: [0, 0, 0, 1] },
        { name: 'Mid grey', model: 'Gray', v: [0.5] },
        { name: 'White', model: 'LAB ', v: [1, 0, 0] },
        { name: 'Black', model: 'LAB ', v: [0, 0, 0] },
      ]),
      'Test',
    );
    expect(r.palette.name).toBe('Test');
    expect(r.palette.colors).toEqual(['#ff0000', '#00ffff', '#000000', '#808080', '#ffffff', '#000000']);
    expect(r.palette.names).toEqual(['Red', 'Cyan ink', 'Black ink', 'Mid grey', 'White', 'Black']);
    expect(r.palette.ramps).toBeUndefined();
    expect(r.total).toBe(6);
  });

  it('turns groups into ramps with their names', () => {
    const r = parseAdobeSwatches(
      swatches([
        { name: 'Loose', model: 'RGB ', v: [0, 0, 0] },
        { group: 'Warm' },
        { name: 'A', model: 'RGB ', v: [1, 0, 0] },
        { name: 'B', model: 'RGB ', v: [1, 1, 0] },
        { end: true },
        { group: 'Cool' },
        { name: 'C', model: 'RGB ', v: [0, 0, 1] },
        { end: true },
      ]),
    );
    expect(r.palette.colors).toHaveLength(4);
    expect(r.palette.ramps).toEqual([1, 3]);
    expect(r.palette.rampNames).toEqual({ 1: 'Warm', 3: 'Cool' });
    expect(r.groups).toBe(2);
  });

  it('needs no ramp for a first group at the start', () => {
    const r = parseAdobeSwatches(swatches([{ group: 'All' }, { name: 'A', model: 'RGB ', v: [1, 1, 1] }, { name: 'B', model: 'RGB ', v: [0, 0, 0] }, { end: true }]));
    expect(r.palette.ramps).toBeUndefined();
    expect(r.palette.rampNames).toEqual({ 0: 'All' });
  });

  it('leaves out colours it cannot read and stops at 256', () => {
    const many: Block[] = Array.from({ length: 300 }, (_, i) => ({ name: `c${i}`, model: 'Gray' as const, v: [i / 300] }));
    const r = parseAdobeSwatches(swatches([{ name: 'odd', model: 'XXXX', v: [1] }, ...many]));
    expect(r.palette.colors).toHaveLength(256);
    expect(r.skipped).toBe(1);
    expect(r.cut).toBe(44);
  });

  it('refuses a file that is not swatches, or has no colours', () => {
    expect(() => parseAdobeSwatches(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toThrow(PaletteProblem);
    expect(() => parseAdobeSwatches(swatches([{ group: 'Empty' }, { end: true }]))).toThrow(/No colours/);
  });

  it('converts LAB close to known colours', () => {
    // sRGB red in D50 LAB is about (54.3, 80.8, 69.9).
    const [r, g, b] = labToRgb(54.29, 80.8, 69.89).map((v) => Math.round(v * 255));
    expect(r).toBeGreaterThan(250);
    expect(g).toBeLessThan(6);
    expect(b).toBeLessThan(6);
    // Mid grey (L 53.4) is near 128.
    const grey = labToRgb(53.39, 0, 0).map((v) => Math.round(v * 255));
    for (const v of grey) expect(Math.abs(v - 128)).toBeLessThan(3);
    expect(cmykToRgb(0, 0, 0, 0.5).map((v) => Math.round(v * 255))).toEqual([128, 128, 128]);
  });

  it('keeps names and ramp names in step with palette edits, and in a saved file', () => {
    const r = parseAdobeSwatches(swatches([{ name: 'A', model: 'RGB ', v: [1, 0, 0] }, { group: 'G' }, { name: 'B', model: 'RGB ', v: [0, 1, 0] }, { name: 'C', model: 'RGB ', v: [0, 0, 1] }, { end: true }]));
    let p = r.palette;
    p = insertColor(p, '#123456', 0);
    expect(p.names).toEqual(['A', '', 'B', 'C']);
    expect(p.rampNames).toEqual({ 2: 'G' });
    expect(p.ramps).toEqual([2]);
    p = removeColor(p, 0);
    expect(p.names).toEqual(['', 'B', 'C']);
    expect(p.rampNames).toEqual({ 1: 'G' });
    p = moveColor(p, 2, 1);
    expect(p.names).toEqual(['', 'C', 'B']);
    p = toggleRampStart(p, 1);
    expect(p.rampNames).toBeUndefined();
    const doc = newDoc({ name: 'x', width: 4, height: 4 });
    doc.palette = r.palette;
    const back = loadFile(saveFile(doc)).doc;
    expect(back.palette).toEqual(r.palette);
  });
});

// Opt-in: ASE_SWATCH_DIR=<folder> reads every .ase swatch file under it (drawings that share the ending are skipped).
const DIR = process.env.ASE_SWATCH_DIR;
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : /\.ase$/i.test(e.name) ? [path.join(dir, e.name)] : []));
}
describe.skipIf(!DIR)('swatch files on this machine', () => {
  it('reads every Adobe swatch file', () => {
    let n = 0;
    let colours = 0;
    for (const f of walk(DIR!)) {
      const bytes = new Uint8Array(readFileSync(f));
      if (!isAdobeSwatches(bytes)) continue;
      const r = parseAdobeSwatches(bytes, 'x');
      expect(r.palette.colors.length, f).toBeGreaterThan(0);
      expect(r.skipped, f).toBe(0);
      for (const c of r.palette.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
      n++;
      colours += r.palette.colors.length;
    }
    console.log(`read ${n} swatch files, ${colours} colours`);
    expect(n).toBeGreaterThan(0);
  });
});
