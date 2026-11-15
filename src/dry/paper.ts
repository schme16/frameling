/**
 * Paper for the dry media (charcoal, chalk, pastel, crayon, pencil). Each paper is a small tile of heights, one per
 * pixel, that repeats across the page. Pigment catches on the high points and skips the low ones, so the paper is what
 * makes a stroke look like charcoal and not like a soft grey line. The tile is fixed against the page, so two strokes
 * over each other meet the same bumps. Pure functions, no DOM.
 */

export type PaperKind = 'smooth' | 'fine' | 'medium' | 'laid' | 'rough';

export interface PaperInfo {
  id: PaperKind;
  label: string;
  hint: string;
  /** How much of the bumpiness a stroke feels, 0 (none) to 1 (all of it). */
  tooth: number;
}

export const PAPERS: PaperInfo[] = [
  { id: 'smooth', label: 'Smooth', hint: 'Hot-press and card: a gentle, even grain, so marks are soft and fill in fast.', tooth: 0.55 },
  { id: 'fine', label: 'Fine', hint: 'Sketch paper: a small, busy grain.', tooth: 0.8 },
  { id: 'medium', label: 'Medium', hint: 'Cold-press paper: a rounded, mottled tooth.', tooth: 1 },
  { id: 'laid', label: 'Laid', hint: 'Ingres and charcoal paper: a woven criss-cross, the look of a drawing by Seurat.', tooth: 1 },
  { id: 'rough', label: 'Rough', hint: 'Watercolour paper: big bumps, so light strokes break into specks.', tooth: 1 },
];

export const PAPER_IDS: PaperKind[] = PAPERS.map((p) => p.id);
export const isPaper = (v: unknown): v is PaperKind => typeof v === 'string' && (PAPER_IDS as string[]).includes(v);
export const paperInfo = (k: PaperKind): PaperInfo => PAPERS.find((p) => p.id === k) ?? PAPERS[2];

/** The tile is this many pixels across and down. Every lattice scale divides it, so it wraps without a seam. */
export const TILE = 256;

/** A whole number from three, the same every time (a small integer hash). */
function hash(a: number, b: number, c: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Value noise on a lattice `scale` pixels apart, wrapping at the tile edge. Scale 1 is plain per-pixel noise. */
function noise(x: number, y: number, scale: number, seed: number): number {
  const cells = TILE / scale;
  const gx = x / scale;
  const gy = y / scale;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = smooth(gx - ix);
  const fy = smooth(gy - iy);
  const at = (i: number, j: number) => hash(((i % cells) + cells) % cells, ((j % cells) + cells) % cells, seed);
  const a = at(ix, iy);
  const b = at(ix + 1, iy);
  const c = at(ix, iy + 1);
  const d = at(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** The raw bumpiness of a paper at one pixel, before it is spread evenly over 0 to 1. */
function raw(kind: PaperKind, x: number, y: number): number {
  switch (kind) {
    case 'smooth':
      return 0.3 * noise(x, y, 1, 1) + 0.5 * noise(x, y, 2, 2) + 0.2 * noise(x, y, 4, 3);
    case 'fine':
      return 0.25 * noise(x, y, 1, 4) + 0.4 * noise(x, y, 2, 5) + 0.35 * noise(x, y, 4, 6);
    case 'medium':
      return 0.25 * noise(x, y, 1, 7) + 0.4 * noise(x, y, 2, 8) + 0.25 * noise(x, y, 4, 9) + 0.1 * noise(x, y, 16, 10);
    case 'laid': {
      // Threads running both ways, each a little different, bent a little so no two crossings match, over a soft mottle.
      const u = x + 3.2 * (noise(x, y, 8, 20) - 0.5);
      const v = y + 3.2 * (noise(x, y, 8, 21) - 0.5);
      const col = (0.5 + 0.5 * Math.cos((u * Math.PI) / 2)) * (0.45 + 0.55 * hash(Math.floor(u / 4), 0, 11));
      const row = (0.5 + 0.5 * Math.cos((v * Math.PI) / 2)) * (0.45 + 0.55 * hash(0, Math.floor(v / 4), 12));
      return 0.3 * (col + row) + 0.12 * noise(x, y, 1, 13) + 0.28 * noise(x, y, 2, 14) + 0.2 * noise(x, y, 4, 22) + 0.1 * noise(x, y, 16, 15);
    }
    case 'rough':
      return 0.1 * noise(x, y, 1, 16) + 0.2 * noise(x, y, 2, 17) + 0.35 * noise(x, y, 4, 18) + 0.35 * noise(x, y, 8, 19);
  }
}

const tiles = new Map<PaperKind, Uint8Array>();

/**
 * The tile for a paper: a height per pixel, 0 (a pit) to 255 (a peak), spread evenly so that the share of pixels a
 * stroke reaches at a given pressure is the same on every paper. Made once, then kept.
 */
export function paperTile(kind: PaperKind): Uint8Array {
  const have = tiles.get(kind);
  if (have) return have;
  const n = TILE * TILE;
  const vals = new Float32Array(n);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) vals[y * TILE + x] = raw(kind, x, y);
  // Rank each pixel, so the heights are evenly spread.
  const order = Uint32Array.from({ length: n }, (_, i) => i).sort((a, b) => vals[a] - vals[b]);
  const out = new Uint8Array(n);
  for (let r = 0; r < n; r++) out[order[r]] = Math.round((r / (n - 1)) * 255);
  tiles.set(kind, out);
  return out;
}

/** The height of the paper under pixel (x, y) of the page, 0 to 1. Works for negative pixels too. */
export function paperHeight(kind: PaperKind, x: number, y: number): number {
  const t = paperTile(kind);
  const tx = ((x % TILE) + TILE) % TILE;
  const ty = ((y % TILE) + TILE) % TILE;
  return t[ty * TILE + tx] / 255;
}
