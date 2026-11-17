// The paper drawn to stand in for a soft paper of Procreate's own (src/brushes/import/standInPaper.ts).
import { describe, expect, it } from 'vitest';
import { fibrePaper } from '../../src/brushes/import/standInPaper';
import { cleanPicture, decodeBytes } from '../../src/dab/texturePicture';

describe('the fibrous stand in paper', () => {
  const p = fibrePaper();
  const v = decodeBytes(p.data, p.side * p.side)!;
  const at = (x: number, y: number): number => v[(((y % 256) + 256) % 256) * 256 + (((x % 256) + 256) % 256)];

  it('is a whole tile, the same every time, and reads back as a texture picture', () => {
    expect(p.side).toBe(256);
    expect(cleanPicture(p)).toEqual(p);
    expect(fibrePaper()).toBe(p);
  });

  it('runs from pits to peaks, with most of it in between', () => {
    const sorted = Array.from(v).sort((a, b) => a - b);
    expect(sorted[Math.floor(sorted.length * 0.02)]).toBeLessThan(70);
    expect(sorted[Math.floor(sorted.length * 0.98)]).toBeGreaterThan(215);
    const mid = sorted[sorted.length >> 1];
    expect(mid).toBeGreaterThan(90);
    expect(mid).toBeLessThan(190);
  });

  it('has fibres lying across the sheet: it changes far more going down than going along', () => {
    let along = 0;
    let down = 0;
    for (let y = 0; y < 256; y += 3) for (let x = 0; x < 256; x += 3) {
      along += Math.abs(at(x + 6, y) - at(x, y));
      down += Math.abs(at(x, y + 6) - at(x, y));
    }
    expect(down).toBeGreaterThan(along * 1.15);
  });

  it('repeats without a seam: the step across the edge is no bigger than a step anywhere else', () => {
    let edge = 0;
    let inside = 0;
    for (let i = 0; i < 256; i++) {
      edge += Math.abs(at(255, i) - at(256, i)) + Math.abs(at(i, 255) - at(i, 256));
      inside += Math.abs(at(100, i) - at(101, i)) + Math.abs(at(i, 100) - at(i, 101));
    }
    expect(edge).toBeLessThan(inside * 1.3);
  });
});
