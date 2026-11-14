// Runs the old and new pickers over a raw RGBA file and writes the colours each picked, and the error of each.
import { readFileSync, writeFileSync } from 'node:fs';
import { sortForRamps } from '../../../../src/pixel/palette-io';
import { pickColours, tableOf } from '../../../../src/pixel/quantise';
import { oldPick } from './old-quantise';

const [, , rawPath, outPath] = process.argv;
const px = new Uint8ClampedArray(readFileSync(rawPath));

/** Mean distance from each solid pixel to the nearest colour of the palette (what the help numbers measured). */
function meanError(colours: number[]): number {
  const rs = colours.map((k) => (k >> 16) & 255), gs = colours.map((k) => (k >> 8) & 255), bs = colours.map((k) => k & 255);
  let sum = 0, n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    let best = Infinity;
    for (let c = 0; c < rs.length; c++) {
      const d = (px[i] - rs[c]) ** 2 + (px[i + 1] - gs[c]) ** 2 + (px[i + 2] - bs[c]) ** 2;
      if (d < best) best = d;
    }
    sum += Math.sqrt(best);
    n++;
  }
  return sum / n;
}

const table = tableOf(px);
const out: Record<string, { old: number[]; new: number[]; oldErr: number; newErr: number }> = {};
for (const max of [4, 16, 32]) {
  const o = oldPick(px, max);
  const n = pickColours(table, max);
  out[max] = { old: sortForRamps(o), new: sortForRamps(n), oldErr: meanError(o), newErr: meanError(n) };
  console.log(max, 'old', o.length, out[max].oldErr.toFixed(1), 'new', n.length, out[max].newErr.toFixed(1));
}
writeFileSync(outPath, JSON.stringify(out));
