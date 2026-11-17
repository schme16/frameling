// The papers drawn to stand in for Procreate's own (src/brushes/import/standInGrit.ts) and the tips (standInTip.ts).
import { describe, expect, it } from 'vitest';
import { canvasPaper, charcoalPaper, pastelPaper, spread, splatterPaper } from '../../src/brushes/import/standInGrit';
import { standInTip } from '../../src/brushes/import/standInTip';
import { cleanPicture, decodeBytes, type TexturePicture } from '../../src/dab/texturePicture';

const read = (p: TexturePicture): ((x: number, y: number) => number) => {
  const v = decodeBytes(p.data, p.side * p.side)!;
  return (x, y) => v[(((y % 256) + 256) % 256) * 256 + (((x % 256) + 256) % 256)];
};
const sortedOf = (p: TexturePicture): number[] => Array.from(decodeBytes(p.data, p.side * p.side)!).sort((a, b) => a - b);
/** How alike a pixel is to the one `dx, dy` away, 1 for the same, 0 for no link (correlation over the whole tile). */
function link(p: TexturePicture, dx: number, dy: number): number {
  const at = read(p);
  let n = 0;
  let sa = 0;
  let sb = 0;
  let saa = 0;
  let sbb = 0;
  let sab = 0;
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const a = at(x, y);
      const b = at(x + dx, y + dy);
      n++;
      sa += a;
      sb += b;
      saa += a * a;
      sbb += b * b;
      sab += a * b;
    }
  return (sab / n - (sa / n) * (sb / n)) / Math.sqrt((saa / n - (sa / n) ** 2) * (sbb / n - (sb / n) ** 2));
}
/**
 * The step across the tile's edge against a step inside it: close to 1 when the tile repeats without a seam. A weave
 * steps sharply from one thread to the next, and the tile's edge falls on one of those, so `every` says how far apart
 * the lines are that the steps inside are taken across (the weave's threads are 8 pixels apart).
 */
function seam(p: TexturePicture, every = 1): number {
  const at = read(p);
  let edge = 0;
  let inside = 0;
  let lines = 0;
  for (let k = every * 2 - 1; k < 240; k += every) lines++;
  for (let i = 0; i < 256; i++) {
    edge += Math.abs(at(255, i) - at(256, i)) + Math.abs(at(i, 255) - at(i, 256));
    for (let k = every * 2 - 1; k < 240; k += every) inside += (Math.abs(at(k, i) - at(k + 1, i)) + Math.abs(at(i, k) - at(i, k + 1))) / lines;
  }
  return edge / inside;
}

const recipes: [string, () => TexturePicture, number][] = [
  ['pastel', pastelPaper, 1],
  ['charcoal', charcoalPaper, 1],
  ['splatter', splatterPaper, 1],
  ['canvas', canvasPaper, 8],
];

describe.each(recipes)('the %s stand in paper', (_name, make, every) => {
  const p = make();
  it('is a whole tile, the same every time, and reads back as a texture picture', () => {
    expect(p.side).toBe(256);
    expect(cleanPicture(p)).toEqual(p);
    expect(make()).toBe(p);
  });
  it('repeats without a seam', () => {
    expect(seam(p, every)).toBeLessThan(1.35);
  });
  it('is not flat', () => {
    const s = sortedOf(p);
    expect(s[s.length - 1] - s[0]).toBeGreaterThan(150);
  });
});

describe('spread', () => {
  it('pours a field into the heights asked for, keeping its order', () => {
    const field = Float32Array.from({ length: 100 }, (_, i) => (i * 37) % 100);
    const out = spread(field, [[0, 0], [0.5, 0.5], [1, 1]]);
    for (let i = 0; i < 100; i++) expect(Math.abs(out[i] - (field[i] / 99) * 255)).toBeLessThan(3);
    const flat = spread(field, [[0, 1], [1, 1]]);
    expect(Math.min(...flat)).toBe(255);
  });
});

describe('the pastel paper', () => {
  const p = pastelPaper();
  it('is dense and dark in a stroke, with pale specks: most of it high, a thin tail down to the pits', () => {
    const s = sortedOf(p);
    expect(s[Math.floor(s.length * 0.5)]).toBeGreaterThan(200);
    expect(s[Math.floor(s.length * 0.02)]).toBeLessThan(140);
    expect(s[Math.floor(s.length * 0.98)]).toBeGreaterThan(245);
  });
  it('is fine and short, not long fibres: it has let go of itself a few pixels along', () => {
    expect(link(p, 8, 0)).toBeLessThan(0.25);
    expect(link(p, 0, 8)).toBeLessThan(0.15);
  });
  it('lies a little longer along the line than down it', () => {
    expect(link(p, 3, 0)).toBeGreaterThan(link(p, 0, 3) + 0.05);
  });
  it('has a faint knit in it: rows of stitches about 14 pixels apart, 20 across, that repeat on their own', () => {
    // Procreate's picture of Background has rows about 14 pixels apart with stitches about 20 across (an
    // autocorrelation peak of 0.19 at a 20 pixel step along the line). A tile has 18 rows and 13 stitches.
    const at = read(p);
    const corr = (dx: number, dy: number): number => {
      let sum = 0;
      let a = 0;
      let b = 0;
      let mean = 0;
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) mean += at(x, y) / 65536;
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 256; x++) {
          const u = at(x, y) - mean;
          const v = at(x + dx, y + dy) - mean;
          sum += u * v;
          a += u * u;
          b += v * v;
        }
      return sum / Math.sqrt(a * b);
    };
    // A whole row (256 / 18) and a whole stitch (256 / 13) are not whole pixels, so look at the nearest step.
    const along = Math.max(corr(20, 0), corr(19, 0), corr(21, 0));
    const away = Math.min(corr(10, 0), corr(0, 7));
    expect(along).toBeGreaterThan(0.1);
    expect(along).toBeGreaterThan(away + 0.1);
  });
});

describe('the charcoal paper', () => {
  const p = charcoalPaper();
  it('has grit in clumps: pixels near each other are alike, further than a single grain', () => {
    expect(link(p, 1, 0)).toBeGreaterThan(0.4);
    expect(link(p, 6, 0)).toBeGreaterThan(0.02);
    expect(link(p, 1, 0)).toBeGreaterThan(link(p, 6, 0));
  });
  it('has no lean to one direction', () => {
    expect(Math.abs(link(p, 3, 0) - link(p, 0, 3))).toBeLessThan(0.1);
  });
});

describe('the splatter paper', () => {
  const p = splatterPaper();
  it('is nearly all tooth with a few pin pricks: the lowest couple of percent are far below the rest', () => {
    const s = sortedOf(p);
    expect(s[Math.floor(s.length * 0.01)]).toBeLessThan(10);
  });
  it('has its specks in places, not one every cell: the low pixels clump into spots', () => {
    const v = decodeBytes(p.data, 65536)!;
    const cut = sortedOf(p)[Math.floor(65536 * 0.03)];
    let low = 0;
    let lowNextToLow = 0;
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 255; x++)
        if (v[y * 256 + x] <= cut) {
          low++;
          if (v[y * 256 + x + 1] <= cut) lowNextToLow++;
        }
    expect(lowNextToLow / low).toBeGreaterThan(0.3);
  });
});

describe('the canvas paper', () => {
  const p = canvasPaper();
  it('has a weave: alike a thread away, not alike half a thread away', () => {
    expect(link(p, 8, 0) + link(p, 0, 8)).toBeGreaterThan(link(p, 4, 0) + link(p, 0, 4) + 0.3);
  });
  it('is not a ruled grid: two threads along the same row are not copies of each other', () => {
    const at = read(p);
    let same = 0;
    for (let y = 0; y < 256; y += 3) for (let x = 0; x < 240; x += 3) if (at(x, y) === at(x + 16, y)) same++;
    expect(same / ((256 / 3) * (240 / 3))).toBeLessThan(0.3);
  });
});

describe('the stand in tips', () => {
  const blot = standInTip('Brush-Preset-Blotch.jpg', true)!;
  const pen = standInTip('Brush-Preset-Blotch.jpg')!;
  const brick = standInTip('Brush-Pocket-Brick.png')!;
  it('are drawn for the shapes of Procreate\'s that the card names, and for no other', () => {
    expect(blot).toBeTruthy();
    expect(pen).toBeTruthy();
    expect(brick).toBeTruthy();
    expect(standInTip('Brush-Preset-Soft.png')).toBeNull();
    expect(standInTip('Brush-Preset-Ink2.jpg')).toBeNull();
    expect(standInTip('')).toBeNull();
  });
  it('are the same every time', () => {
    expect(standInTip('Brush-Preset-Blotch.jpg', true)).toBe(blot);
    for (const t of [blot, pen, brick]) expect(t.paint(40, 50)).toBe(t.paint(40, 50));
  });
  it.each([['blotch', blot], ['pen', pen], ['brick', brick]] as const)('the %s is solid in the middle, empty at the corners, and fades between', (_n, t) => {
    expect(t.paint(t.w >> 1, t.h >> 1)).toBe(255);
    expect(t.paint(0, 0)).toBe(0);
    expect(t.paint(t.w - 1, t.h - 1)).toBe(0);
    let mid = 0;
    for (let x = 0; x < t.w; x++) {
      const v = t.paint(x, t.h >> 1);
      if (v > 20 && v < 235) mid++;
    }
    expect(mid).toBeGreaterThan(4);
  });
  it('have a ragged edge: the rim is not the same distance out all the way round', () => {
    const reach = (t: typeof blot, angle: number): number => {
      let r = 0;
      for (let d = 0; d < t.w / 2; d += 0.5) if (t.paint(Math.round(t.w / 2 + Math.cos(angle) * d), Math.round(t.h / 2 + Math.sin(angle) * d)) > 128) r = d;
      return r;
    };
    for (const t of [blot, pen]) {
      const rs = Array.from({ length: 24 }, (_, i) => reach(t, (i / 24) * Math.PI * 2));
      expect(Math.max(...rs) - Math.min(...rs)).toBeGreaterThan(3);
    }
  });
  it('the soft one fades further than the pen one', () => {
    const wide = (t: typeof blot): number => {
      let n = 0;
      for (let x = 0; x < t.w; x++) {
        const v = t.paint(x, t.h >> 1);
        if (v > 20 && v < 235) n++;
      }
      return n;
    };
    expect(wide(blot)).toBeGreaterThan(wide(pen));
  });
});
