import { newDoc } from '../core/doc';
import type { Doc } from '../core/format';
import { addClip, addMarker, addPixelLayer, blankGrid, emptyOf, hold, pixelDrawing, swatchesFrom, type PixelPalette } from './build';

// k outline, s skin, h hair, t shirt, T shirt shade (far arm), p trousers, P far leg, b shoes, d dust.
const PALETTE: PixelPalette = { k: '#1d1b26', s: '#ffc9a3', h: '#7a3d2a', t: '#5ab8ff', T: '#3a7fc2', p: '#4a4560', P: '#2e2a40', b: '#ff6f91', d: '#e6dccb' };

const SIZE = 32;
const FRAMES = 8;

type Grid = string[][];

function put(g: Grid, x: number, y: number, ch: string): void {
  const gx = Math.round(x);
  const gy = Math.round(y);
  if (gy >= 0 && gy < SIZE && gx >= 0 && gx < SIZE) g[gy][gx] = ch;
}

/** A thick line between two points, stamped as small squares. */
function line(g: Grid, a: [number, number], b: [number, number], ch: string, thick = 2): void {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 2));
  for (let i = 0; i <= n; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / n;
    const y = a[1] + ((b[1] - a[1]) * i) / n;
    for (let dy = 0; dy < thick; dy++) for (let dx = 0; dx < thick; dx++) put(g, x + dx - (thick - 1) / 2, y + dy - (thick - 1) / 2, ch);
  }
}

function disc(g: Grid, cx: number, cy: number, r: number, ch: string): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(g, x, y, ch);
}

/** Rings everything drawn with a one-pixel dark outline, the classic sprite look. */
function outline(g: Grid): void {
  const src = g.map((r) => r.slice());
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (src[y][x] !== '.') continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
        const c = src[y + dy]?.[x + dx];
        return c !== undefined && c !== '.' && c !== 'd';
      });
      if (near) g[y][x] = 'k';
    }
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Hip-relative leg: a big swing, a high knee on the way forward. */
function leg(hip: [number, number], p: number): [number, number][] {
  const s = Math.sin(p * Math.PI * 2);
  const thigh = 40 * Math.cos(p * Math.PI * 2) + 6;
  const shin = thigh - 10 - Math.max(0, -s) * 95;
  const knee: [number, number] = [hip[0] + Math.sin(rad(thigh)) * 5.5, hip[1] + Math.cos(rad(thigh)) * 5.5];
  const ankle: [number, number] = [knee[0] + Math.sin(rad(shin)) * 5.5, knee[1] + Math.cos(rad(shin)) * 5.5];
  return [hip, knee, ankle];
}

function frame(i: number): Grid {
  const g = blankGrid(SIZE, SIZE);
  const p = i / FRAMES;
  // Up on the passing frames, down on the contacts: a run floats between steps.
  const bob = Math.round(Math.abs(Math.sin(p * Math.PI * 2)) * -1.6 + 0.6);
  const hip: [number, number] = [14, 18 + bob];
  const neck: [number, number] = [17, 11 + bob];
  const swing = 50 * Math.cos(p * Math.PI * 2);
  const arm = (sw: number, ch: string) => {
    const elbow: [number, number] = [neck[0] + Math.sin(rad(sw)) * 4, neck[1] + 1 + Math.cos(rad(sw)) * 4];
    line(g, [neck[0], neck[1] + 1], elbow, ch);
    line(g, elbow, [elbow[0] + Math.sin(rad(sw + 80)) * 3.5, elbow[1] + Math.cos(rad(sw + 80)) * 3.5], 's');
  };
  const legPts = (q: number, ch: string) => {
    const [a, b, c] = leg(hip, q);
    line(g, a, b, ch);
    line(g, b, c, ch);
    line(g, c, [c[0] + 2, c[1]], 'b');
  };
  // Far side first, then the body, then the near side on top.
  legPts(p + 0.5, 'P');
  arm(swing, 'T');
  line(g, hip, neck, 't', 4);
  disc(g, 18.5, 6.5 + bob, 4, 's');
  for (let x = 14; x <= 22; x++) for (let y = 2 + bob; y <= 4 + bob; y++) if ((x - 18.5) ** 2 + (y - 6.5 - bob) ** 2 <= 17) put(g, x, y, 'h');
  put(g, 21, 6 + bob, 'k');
  legPts(p, 'p');
  arm(-swing, 't');
  outline(g);
  // A puff of dust kicked up just after each foot lands.
  if (i === 1 || i === 5) [[8, 29], [6, 28], [9, 27], [5, 30]].forEach(([x, y]) => put(g, x, y, 'd'));
  if (i === 2 || i === 6) [[5, 28], [3, 27], [4, 29]].forEach(([x, y]) => put(g, x, y, 'd'));
  return g;
}

/** An 8-frame pixel run cycle on a 32x32 grid, drawn from a little stick skeleton and outlined, with footsteps. */
export function makeRunCycle(): Doc {
  const doc = emptyOf(newDoc({ name: 'Run cycle', width: 256, height: 256, fps: 12, length: FRAMES, background: null }));
  swatchesFrom(doc, [['Outline', PALETTE.k], ['Skin', PALETTE.s], ['Hair', PALETTE.h], ['Shirt', PALETTE.t], ['Shirt shade', PALETTE.T], ['Trousers', PALETTE.p], ['Shoes', PALETTE.b], ['Dust', PALETTE.d]]);
  const dust = addPixelLayer(doc, 'Dust', 8);
  const runner = addPixelLayer(doc, 'Runner', 8);
  for (let i = 0; i < FRAMES; i++) {
    const g = frame(i);
    hold(runner, pixelDrawing(doc, g, PALETTE, 'kshtTpPb').id, i);
    if (g.some((r) => r.includes('d'))) hold(dust, pixelDrawing(doc, g, PALETTE, 'd').id, i);
  }
  addClip(doc, 'run', 0, FRAMES - 1, true);
  addMarker(doc, 'footstep', 0);
  addMarker(doc, 'footstep', 4);
  return doc;
}
