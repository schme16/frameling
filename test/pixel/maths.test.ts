import { describe, expect, it } from 'vitest';
import type { DocPalette } from '../../src/core/format';
import { colorUse, colorUseRange, exactIndex, insertColor, makeRamp, moveColor, nearestIndex, paletteRgb, rampOf, ramps, reduceToPalette, remapColor, removeColor, shadeStep, toggleRampStart } from '../../src/pixel/palette';
import { PaletteProblem, paletteFromPixels, parseGpl, parseHexList, parseJascPal, parsePaletteFile, toGpl, toHexList, toJascPal } from '../../src/pixel/palette-io';
import { dragBox, plotEllipse, plotLine, plotRect, snapCleanLine } from '../../src/pixel/raster';
import { DITHER_PATTERNS, ditherOn } from '../../src/pixel/dither';
import { makeMirror, mirrorPoints } from '../../src/pixel/ink';
import { contentBounds, flipH, flipV, outline, rotateQuarter, rotateSmooth, scale2x } from '../../src/pixel/transform';
import { STARTER_PALETTES } from '../../src/pixel/builtin';

const pal: DocPalette = { name: 'T', colors: ['#000000', '#555555', '#aaaaaa', '#ff0000', '#880000'], ramps: [3] };

/** A w x h image from rows of characters: '.' clear, anything else a colour from the key. */
function img(rows: string[], key: Record<string, [number, number, number]> = { '#': [0, 0, 0], r: [255, 0, 0] }) {
  const h = rows.length;
  const w = rows[0].length;
  const pixels = new Uint8ClampedArray(w * h * 4);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') return;
      const c = key[ch] ?? [9, 9, 9];
      pixels.set([...c, 255], (y * w + x) * 4);
    }),
  );
  return { width: w, height: h, pixels };
}
function rowsOf(d: { width: number; height: number; pixels: Uint8ClampedArray }): string[] {
  const out: string[] = [];
  for (let y = 0; y < d.height; y++) {
    let r = '';
    for (let x = 0; x < d.width; x++) r += d.pixels[(y * d.width + x) * 4 + 3] ? '#' : '.';
    out.push(r);
  }
  return out;
}

describe('palette maths', () => {
  it('finds the nearest colour and the ramps', () => {
    const rgb = paletteRgb(pal.colors);
    expect(nearestIndex(rgb, 250, 10, 10)).toBe(3);
    expect(nearestIndex(rgb, 90, 90, 90)).toBe(1);
    expect(rampOf(pal, 1)).toEqual([0, 3]);
    expect(rampOf(pal, 4)).toEqual([3, 5]);
    expect(ramps(pal)).toEqual([[0, 3], [3, 5]]);
  });

  it('shades along a ramp either way round, and stops at its ends', () => {
    const rgb = paletteRgb(pal.colors);
    expect(shadeStep(pal, rgb, 1, true)).toBe(2);
    expect(shadeStep(pal, rgb, 1, false)).toBe(0);
    expect(shadeStep(pal, rgb, 2, true)).toBe(2);
    // The red ramp is stored light to dark: lighter goes down the list.
    expect(shadeStep(pal, rgb, 4, true)).toBe(3);
    expect(shadeStep(pal, rgb, 3, false)).toBe(4);
  });

  it('reduces to the palette and recolours one colour', () => {
    const rgb = paletteRgb(pal.colors);
    const px = new Uint8ClampedArray([250, 5, 5, 255, 10, 10, 10, 100, 0, 0, 0, 0]);
    const r = reduceToPalette(px, rgb);
    expect([...r.pixels]).toEqual([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(r.changed).toBe(2);
    const red = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 255]);
    expect([...remapColor(red, [255, 0, 0], [0, 255, 0])!]).toEqual([0, 255, 0, 255, 0, 0, 0, 255]);
    expect(remapColor(red, [1, 2, 3], [0, 0, 0])).toBeNull();
    const counts = new Uint32Array(5);
    colorUse(red, rgb, counts);
    expect([...counts]).toEqual([1, 0, 0, 1, 0]);
  });

  it('counts colour use like a plain exact-match scan, whole or in slices, with duplicates and odd offsets', () => {
    const colors = ['#000000', '#ff0000', '#00ff00', '#ff0000', '#0000ff', '#123456'];
    const rgb = paletteRgb(colors);
    const n = 5000;
    const px = new Uint8ClampedArray(n * 4);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 8) & 255;
    for (let i = 0; i < n; i++) {
      const c = rgb.subarray((rnd() % 7) * 3, (rnd() % 7) * 3 + 3);
      px.set(c.length === 3 ? c : [rnd(), rnd(), rnd()], i * 4);
      px[i * 4 + 3] = rnd() % 4 === 0 ? 0 : rnd() % 2 ? 255 : 90;
    }
    const want = new Uint32Array(colors.length);
    for (let i = 0; i < n; i++) {
      if (px[i * 4 + 3] === 0) continue;
      const k = exactIndex(rgb, px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
      if (k >= 0) want[k]++;
    }
    const whole = new Uint32Array(colors.length);
    colorUse(px, rgb, whole);
    expect([...whole]).toEqual([...want]);
    const sliced = new Uint32Array(colors.length);
    for (let at = 0; at < n; at += 777) colorUseRange(px, rgb, sliced, at, Math.min(n, at + 777));
    expect([...sliced]).toEqual([...want]);
    expect(whole[3]).toBe(0);
    // A view that does not start on a 4-byte boundary takes the plain path and agrees.
    const shifted = new Uint8ClampedArray(new ArrayBuffer(n * 4 + 1), 1, n * 4);
    shifted.set(px);
    const odd = new Uint32Array(colors.length);
    colorUse(shifted, rgb, odd);
    expect([...odd]).toEqual([...want]);
  });

  it('edits palettes and keeps ramps pointing at the same colours', () => {
    const added = insertColor(pal, '#123456', 0);
    expect(added.colors[1]).toBe('#123456');
    expect(added.ramps).toEqual([4]);
    const removed = removeColor(pal, 0);
    expect(removed.ramps).toEqual([2]);
    expect(removeColor({ name: 'x', colors: ['#000000', '#ffffff'], ramps: [1] }, 1).ramps).toBeUndefined();
    expect(moveColor(pal, 0, 2).colors.slice(0, 3)).toEqual(['#555555', '#aaaaaa', '#000000']);
    expect(toggleRampStart(pal, 3).ramps).toBeUndefined();
    expect(toggleRampStart(pal, 1).ramps).toEqual([1, 3]);
  });

  it('makes a ramp from dark to light through the colour', () => {
    const r = makeRamp('#4080c0', 5);
    expect(r).toHaveLength(5);
    expect(r[2]).toBe('#4080c0');
    const l = r.map((c) => parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16));
    for (let i = 1; i < l.length; i++) expect(l[i]).toBeGreaterThan(l[i - 1]);
  });

  it('ships starter palettes with sensible ramps', () => {
    for (const s of STARTER_PALETTES) {
      expect(s.palette.colors.length).toBeGreaterThan(1);
      for (const c of s.palette.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
      for (const r of s.palette.ramps ?? []) expect(r).toBeLessThan(s.palette.colors.length);
    }
  });
});

describe('palette files', () => {
  it('reads and writes GIMP palettes', () => {
    const p = parseGpl('GIMP Palette\nName: Moss\nColumns: 4\n# comment\n  0   0   0\tBlack\n255 128   1 Orange\n');
    expect(p).toEqual({ name: 'Moss', colors: ['#000000', '#ff8001'] });
    expect(parseGpl(toGpl(pal))).toMatchObject({ name: 'T', colors: pal.colors });
    expect(() => parseGpl('nope')).toThrow(PaletteProblem);
  });
  it('reads and writes hex lists and JASC palettes', () => {
    expect(parseHexList('ff0000\n#00FF00\n\nzzz\n0000ffcc', 'x').colors).toEqual(['#ff0000', '#00ff00', '#0000ff']);
    expect(parseHexList(toHexList(pal)).colors).toEqual(pal.colors);
    const jasc = toJascPal(pal);
    expect(jasc.startsWith('JASC-PAL\r\n0100\r\n5\r\n0 0 0')).toBe(true);
    expect(parseJascPal(jasc).colors).toEqual(pal.colors);
    expect(() => parseJascPal('RIFF')).toThrow(PaletteProblem);
  });
  it('picks the reader by file name, and names the palette after the file', () => {
    expect(parsePaletteFile('C:\\pals\\sunset.hex', 'ff0000').name).toBe('sunset');
    expect(parsePaletteFile('a.pal', toJascPal(pal)).colors).toHaveLength(5);
    expect(parsePaletteFile('a.weird', toGpl(pal)).name).toBe('T');
    expect(() => parsePaletteFile('a.hex', 'nothing here')).toThrow(PaletteProblem);
  });
  it('takes a palette from pixels, cutting it down when there are too many', () => {
    const few = img(['#r.', 'rr#']);
    expect(paletteFromPixels(few.pixels).colors.sort()).toEqual(['#000000', '#ff0000']);
    const many = new Uint8ClampedArray(64 * 4);
    for (let i = 0; i < 64; i++) many.set([i * 4, 255 - i * 4, (i * 37) % 256, 255], i * 4);
    expect(paletteFromPixels(many, 'x', 8).colors).toHaveLength(8);
    expect(() => paletteFromPixels(new Uint8ClampedArray(8))).toThrow(PaletteProblem);
  });
});

describe('pixel shapes', () => {
  const collect = (fn: (plot: (x: number, y: number) => void) => void) => {
    const s = new Set<string>();
    fn((x, y) => s.add(`${x},${y}`));
    return s;
  };
  it('snaps lines to clean pixel slopes', () => {
    expect(snapCleanLine({ x: 0, y: 0 }, { x: 10, y: 1 })).toEqual({ x: 10, y: 0 });
    expect(snapCleanLine({ x: 0, y: 0 }, { x: 7, y: 6 })).toEqual({ x: 6, y: 6 });
    const e = snapCleanLine({ x: 0, y: 0 }, { x: 9, y: 4 });
    expect(e).toEqual({ x: 9, y: 4 });
    // Every run of a 2:1 line is two pixels long.
    const runs = new Map<number, number>();
    plotLine(0, 0, e.x, e.y, (_x, y) => runs.set(y, (runs.get(y) ?? 0) + 1));
    expect([...runs.values()]).toEqual([2, 2, 2, 2, 2]);
    expect(snapCleanLine({ x: 5, y: 5 }, { x: -3, y: 5 })).toEqual({ x: -3, y: 5 });
  });
  it('draws rectangle outlines and boxes from drags', () => {
    expect(collect((p) => plotRect(0, 0, 2, 2, false, p)).size).toBe(8);
    expect(collect((p) => plotRect(0, 0, 2, 2, true, p)).size).toBe(9);
    expect(dragBox({ x: 5, y: 5 }, { x: 7, y: 6 }, true, true)).toEqual([{ x: 3, y: 3 }, { x: 7, y: 7 }]);
  });
  it('draws ellipses that are symmetric with no doubled pixels', () => {
    for (const [w, h] of [[7, 7], [8, 8], [11, 6], [4, 9]]) {
      const pts = collect((p) => plotEllipse(0, 0, w - 1, h - 1, p));
      for (const k of pts) {
        const [x, y] = k.split(',').map(Number);
        expect(pts.has(`${w - 1 - x},${y}`)).toBe(true);
        expect(pts.has(`${x},${h - 1 - y}`)).toBe(true);
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThan(w);
      }
      // A clean outline: no pixel has three neighbours in a 2x2 block (that would be a doubled corner).
      for (let y = 0; y < h - 1; y++)
        for (let x = 0; x < w - 1; x++) {
          const n = [pts.has(`${x},${y}`), pts.has(`${x + 1},${y}`), pts.has(`${x},${y + 1}`), pts.has(`${x + 1},${y + 1}`)].filter(Boolean).length;
          if (w > 4 && h > 4) expect(n).toBeLessThan(4);
        }
    }
    const filled = collect((p) => plotEllipse(0, 0, 6, 6, p, p));
    expect(filled.has('3,3')).toBe(true);
  });
});

describe('dither and mirror', () => {
  it('has patterns of the advertised density', () => {
    const density = (id: Parameters<typeof ditherOn>[0]) => {
      let n = 0;
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) n += ditherOn(id, x, y) ? 1 : 0;
      return n / 64;
    };
    expect(density('checker')).toBe(0.5);
    expect(density('light')).toBe(0.25);
    expect(density('heavy')).toBe(0.75);
    expect(density('bayer')).toBe(0.125);
    expect(ditherOn('checker', -1, 0)).toBe(ditherOn('checker', 1, 0));
    expect(DITHER_PATTERNS.every((p) => p.preview.length === 4)).toBe(true);
  });
  it('mirrors around the centre or a line through a pixel', () => {
    const out = new Int32Array(8);
    const m = makeMirror('both', 8, 8, null, null);
    expect(mirrorPoints(m, 1, 2, out)).toBe(4);
    expect([...out]).toEqual([1, 2, 6, 2, 1, 5, 6, 5]);
    // A line through the middle of column 3: that column maps onto itself, so no duplicate.
    const odd = makeMirror('h', 8, 8, 3.5, null);
    expect(mirrorPoints(odd, 3, 0, out)).toBe(1);
    expect(mirrorPoints(odd, 1, 0, out)).toBe(2);
    expect(out[2]).toBe(5);
    expect(mirrorPoints(makeMirror('off', 8, 8, null, null), 1, 1, out)).toBe(1);
  });
});

describe('flip, turn and outline', () => {
  const L = img(['......', '.#....', '.#....', '.###..', '......']);
  it('flips around the middle of what is drawn', () => {
    expect(rowsOf({ ...L, pixels: flipH(L) })).toEqual(['......', '...#..', '...#..', '.###..', '......']);
    expect(rowsOf({ ...L, pixels: flipV(L) })).toEqual(['......', '.###..', '.#....', '.#....', '......']);
    expect(rowsOf({ ...L, pixels: flipH(L, 'canvas') })).toEqual(['......', '....#.', '....#.', '..###.', '......']);
  });
  it('turns exactly by quarter turns, and four of them come back', () => {
    let p: Uint8ClampedArray = L.pixels;
    for (let i = 0; i < 4; i++) p = rotateQuarter({ ...L, pixels: p }, 1);
    expect(rowsOf({ ...L, pixels: p })).toEqual(rowsOf(L));
    const q = rotateQuarter(img(['....', '.##.', '....', '....']), 1);
    expect(rowsOf({ width: 4, height: 4, pixels: q }).join('').split('#').length - 1).toBe(2);
  });
  it('turns by any angle without making new colours', () => {
    const sq = img(['..........', '..rrrrrr..', '..r####r..', '..r####r..', '..r####r..', '..r####r..', '..rrrrrr..', '..........', '..........', '..........']);
    const out = rotateSmooth(sq, 30);
    const seen = new Set<string>();
    for (let i = 0; i < out.length; i += 4) if (out[i + 3]) seen.add(`${out[i]},${out[i + 1]},${out[i + 2]}`);
    expect([...seen].sort()).toEqual(['0,0,0', '255,0,0']);
    expect(contentBounds({ ...sq, pixels: out })).not.toBeNull();
    expect(rowsOf({ ...sq, pixels: rotateSmooth(sq, 90) })).toEqual(rowsOf({ ...sq, pixels: rotateQuarter(sq, 1) }));
  });
  it('scale2x rounds off diagonal steps', () => {
    const src = new Uint32Array([1, 0, 0, 1]);
    const out = scale2x(src, 2, 2);
    expect(out.length).toBe(16);
  });
  it('outlines outside and inside', () => {
    const dot = img(['.....', '.....', '..#..', '.....', '.....']);
    const o = outline(dot, [255, 0, 0, 255], 'outside');
    expect(o.changed).toBe(4);
    expect(outline(dot, [255, 0, 0, 255], 'outside', true).changed).toBe(8);
    const block = img(['....', '.##.', '.##.', '....']);
    const inside = outline(block, [255, 0, 0, 255], 'inside');
    expect(inside.changed).toBe(4);
    expect(outline(img(['..', '..']), [0, 0, 0, 255], 'outside').changed).toBe(0);
  });
  it('is quick on a 256 by 256 drawing', () => {
    const big = { width: 256, height: 256, pixels: new Uint8ClampedArray(256 * 256 * 4) };
    for (let i = 0; i < big.pixels.length; i += 16) big.pixels.set([200, 30, 30, 255], i);
    const t = performance.now();
    flipH(big);
    rotateQuarter(big, 1);
    outline(big, [0, 0, 0, 255], 'outside');
    reduceToPalette(big.pixels, paletteRgb(pal.colors));
    expect(performance.now() - t).toBeLessThan(1000);
  });
});
