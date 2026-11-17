// More papers to stand in for ones of Procreate's own that a .brush only names (see standInPaper.ts for why, and for the
// fibrous one). Each is a fixed recipe, so it is the same every time, and each was matched by eye against Procreate's
// own picture of a stroke made with the paper, never copied from it. Pure, no DOM.
//
// A paper that "thins" the paint (`thin: true`) leaves a stroke exactly as dark as the paper is high, where a stroke
// settles. So those are drawn to a target spread of heights (`spread`), which is the quickest way to match how dark and
// how pitted a stroke is in Procreate's picture.
import { pictureFromBytes, type TexturePicture } from '../../dab/texturePicture';

const SIDE = 256;

/** A number from two whole numbers and a seed, the same every time (a small integer hash), 0 to 1. */
function hash(a: number, b: number, seed: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const ease = (t: number): number => t * t * (3 - 2 * t);

/**
 * Smooth noise with `cx` by `cy` cells across the tile (whole numbers, so it wraps at the edge and the paper repeats
 * without a seam). More cells is finer: 128 cells is a feature two pixels across.
 */
function noise(x: number, y: number, cx: number, cy: number, seed: number): number {
  const gx = (x / SIDE) * cx;
  const gy = (y / SIDE) * cy;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = ease(gx - ix);
  const fy = ease(gy - iy);
  const at = (i: number, j: number): number => hash(((i % cx) + cx) % cx, ((j % cy) + cy) % cy, seed);
  const a = at(ix, iy);
  const b = at(ix + 1, iy);
  const c = at(ix, iy + 1);
  const d = at(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** A paper from a function of the pixel: it runs 0 to 1 and is made seamless by the noise it is built from. */
function draw(f: (x: number, y: number) => number): Float32Array {
  const out = new Float32Array(SIDE * SIDE);
  for (let y = 0; y < SIDE; y++) for (let x = 0; x < SIDE; x++) out[y * SIDE + x] = f(x, y);
  return out;
}

/**
 * Pours a field into a target spread: the pixel at rank u (0 lowest, 1 highest) gets the height `curve` gives there, a
 * list of [rank, height] pairs from rank 0 to rank 1. The shape of the field stays, the spread of heights is the curve.
 */
export function spread(field: Float32Array, curve: [number, number][]): Uint8Array {
  const order = Array.from(field.keys()).sort((a, b) => field[a] - field[b] || a - b);
  const out = new Uint8Array(field.length);
  const last = order.length - 1;
  let seg = 0;
  for (let r = 0; r <= last; r++) {
    const u = r / last;
    while (seg < curve.length - 2 && u > curve[seg + 1][0]) seg++;
    const [u0, h0] = curve[seg];
    const [u1, h1] = curve[seg + 1];
    const t = u1 > u0 ? Math.min(1, Math.max(0, (u - u0) / (u1 - u0))) : 0;
    out[order[r]] = Math.round(255 * (h0 + (h1 - h0) * t));
  }
  return out;
}

const picture = (bytes: Uint8Array): TexturePicture => pictureFromBytes(SIDE, bytes);

/**
 * A faint knit for the pastel paper: rows of stitches, 18 to a tile (14 pixels apart) and 13 stitches to a row (20
 * pixels), each row half a stitch along from the last and leaning the other way, so the rows read as chevrons. 0 to 1.
 * Measured on Procreate's picture of Shenbot's Background (the middle of the stroke, straightened, with the slow
 * changes taken out): the autocorrelation peaks at a step of 20 across (0.19) and at 7 to 11 across and 13 to 15 down
 * (0.15 to 0.16), and a quarter of the pattern's power is rows (stripes across the line). Only the numbers were
 * taken, never the picture.
 */
const KNIT_ROWS = 18;
const KNIT_STITCHES = 13;
/** How far a stitch leans across its row. */
const KNIT_LEAN = 0.6;
/** How much of a stitch is the row it sits in (a ridge all along the line) against the bump of the stitch itself. */
const KNIT_ROW = 0.55;
/** How much of the pastel field is the knit (the rest is the noise). 0.24 gives an autocorrelation peak of 0.13 at 20 across, with the fine and coarse parts of the spectrum within a few points of Procreate's. */
const PASTEL_KNIT = 0.24;
function knit(x: number, y: number): number {
  const gy = (y / SIDE) * KNIT_ROWS;
  const row = Math.floor(gy);
  const v = gy - row;
  const lean = (row % 2 === 0 ? 1 : -1) * (v - 0.5) * KNIT_LEAN;
  const u = (x / SIDE) * KNIT_STITCHES + (row % 2) * 0.5 + lean;
  return Math.sin(Math.PI * v) * (KNIT_ROW + (1 - KNIT_ROW) * Math.sin(Math.PI * (u - Math.floor(u))));
}

let pastel: TexturePicture | null = null;
/**
 * The tooth of a pastel paper: a fine, even bite a few pixels across, a little longer along the line than down it, with
 * pale pin specks where the paper is lowest, and a faint knit over it (see `knit`). Procreate's Background brush on it
 * is dense and dark, with a spread of pale specks, not streaks, so this has none of the long fibres the watercolour
 * paper has. The heights are poured into the spread of Procreate's picture in the middle of the stroke (where the
 * pressure is full): about a quarter of it above 0.9, half above 0.8, and a thin tail down to 0.3.
 */
export function pastelPaper(): TexturePicture {
  if (pastel) return pastel;
  const field = draw((x, y) => {
    const wx = x + (noise(x, y, 8, 8, 21) - 0.5) * 6;
    return noise(wx, y, 100, 170, 31) * 0.28 + noise(wx, y, 64, 128, 32) * 0.28 + noise(wx, y, 28, 85, 35) * 0.2 + noise(wx, y, 12, 48, 33) * 0.12 + hash(x, y, 34) * 0.25 + knit(x, y) * PASTEL_KNIT;
  });
  pastel = picture(spread(field, [[0, 0.3], [0.02, 0.4], [0.06, 0.5], [0.15, 0.6], [0.29, 0.7], [0.47, 0.8], [0.73, 0.9], [1, 1]]));
  return pastel;
}

let charcoal: TexturePicture | null = null;
/**
 * Charcoal paper: grit in clumps at several sizes (a grain, a clump of grains, a patch of clumps), so the pits come in
 * knots of different widths instead of an even peppering. The spread is left for the brush to even out.
 */
export function charcoalPaper(): TexturePicture {
  if (charcoal) return charcoal;
  const field = draw((x, y) => noise(x, y, 128, 128, 41) * 0.3 + noise(x, y, 64, 64, 42) * 0.26 + noise(x, y, 32, 32, 43) * 0.18 + noise(x, y, 12, 12, 44) * 0.08 + hash(x, y, 45) * 0.18);
  charcoal = picture(spread(field, [[0, 0], [1, 1]]));
  return charcoal;
}

let splatter: TexturePicture | null = null;
/**
 * A splatter paper: nearly all of it takes paint, with scattered pin pricks the paint misses, mostly one or two pixels
 * and now and then a small blot. That is what Procreate's Dry Ink 1 stroke looks like: solid, with a few white specks
 * through it and a rough edge, nothing like a grainy paper.
 */
export function splatterPaper(): TexturePicture {
  if (splatter) return splatter;
  const field = draw((x, y) => {
    // Pin pricks: each cell of a coarse grid may hold one, of a size that varies, sitting where its hash says.
    let speck = 0;
    for (let gy = -1; gy <= 1; gy++)
      for (let gx = -1; gx <= 1; gx++) {
        const cx = Math.floor(x / 6) + gx;
        const cy = Math.floor(y / 6) + gy;
        const wx = ((cx % 43) + 43) % 43;
        const wy = ((cy % 43) + 43) % 43;
        if (hash(wx, wy, 51) > 0.24) continue;
        const px = cx * 6 + hash(wx, wy, 52) * 6;
        const py = cy * 6 + hash(wx, wy, 53) * 6;
        const r = 0.45 + hash(wx, wy, 54) * hash(wx, wy, 55) * 1.6;
        const d = Math.hypot(x - px, y - py) / r;
        if (d < 1) speck = Math.max(speck, 1 - d * d);
      }
    const tooth = noise(x, y, 128, 128, 56) * 0.5 + noise(x, y, 43, 43, 57) * 0.3 + hash(x, y, 58) * 0.2;
    return tooth * 0.25 - speck * 1.5;
  });
  splatter = picture(spread(field, [[0, 0], [1, 1]]));
  return splatter;
}

let canvas: TexturePicture | null = null;
/**
 * A canvas: threads over and under in a basket weave, but with threads of uneven width that drift, so the weave is not a
 * ruled grid. The threads' tops are high, where they cross over, and the gaps between them low.
 */
export function canvasPaper(): TexturePicture {
  if (canvas) return canvas;
  const P = 8; // pixels from one thread to the next, so 32 threads across a tile
  const bytes = new Uint8Array(SIDE * SIDE);
  const field = draw((x, y) => {
    // Each thread wanders a little off straight, and each has its own thickness and its own height.
    const wy = y + (noise(x, y, 4, 4, 61) - 0.5) * 3.2 + (noise(x, y, 32, 16, 62) - 0.5) * 1.2;
    const wx = x + (noise(x, y, 4, 4, 63) - 0.5) * 3.2 + (noise(x, y, 16, 32, 64) - 0.5) * 1.2;
    const row = Math.floor(wy / P);
    const col = Math.floor(wx / P);
    const r = ((row % 32) + 32) % 32;
    const c = ((col % 32) + 32) % 32;
    const fy = (wy / P - row) * 2 - 1;
    const fx = (wx / P - col) * 2 - 1;
    // Where a thread runs over, its round back; under, the dip beside it. Which goes over alternates, in a twill.
    const over = (r + c) % 2 === 0;
    const across = over ? 1 - fy * fy : 1 - fx * fx;
    const along = over ? 0.55 + 0.45 * Math.cos(fx * Math.PI * 0.5) : 0.35 + 0.4 * Math.cos(fy * Math.PI * 0.5);
    const thread = 0.75 + (hash(r, c, 65) - 0.5) * 0.3;
    const fuzz = noise(x, y, 128, 128, 66) * 0.2;
    return (across * along * thread + fuzz) * (over ? 1 : 0.8);
  });
  bytes.set(spread(field, [[0, 0.1], [0.5, 0.62], [1, 1]]));
  canvas = picture(bytes);
  return canvas;
}
