// Picking the colours that stand for a picture. Pure functions on pixels, no browser: they run on a worker thread
// (quantise.worker.ts) or, with none, in small steps on the page (quantiseRun.ts).
//
// Two stages. A Histogram counts the picture's solid colours a chunk of pixels at a time (exactly while there are
// few, in 5-bit bins with their true average colour once there are many). Then pickColours takes the colours: all of
// them when there are no more than the limit, else variance-driven box cutting followed by a few rounds of k-means,
// so a small limit still gives colours that look like the picture's own.

export interface ColourTable {
  /** Packed 0xRRGGBB of each colour (a bin's average colour when the picture had too many to count exactly). */
  keys: Uint32Array;
  /** How many pixels each colour stands for. */
  weights: Float64Array;
  /** True when every distinct colour of the picture is in the table as it is. */
  exact: boolean;
  /** Solid pixels counted. */
  solid: number;
}

/** Exact counting stops at this many distinct colours; past it the colours are grouped into bins. */
export const EXACT_LIMIT = 1 << 16;
const SLOTS = EXACT_LIMIT * 2;
const BIN_BITS = 5;
const BINS = 1 << (BIN_BITS * 3);

const SOLID = 128;

export class Histogram {
  private slotKey = new Uint32Array(SLOTS);
  private slotCount = new Uint32Array(SLOTS);
  private used = 0;
  private bins: { r: Float64Array; g: Float64Array; b: Float64Array; n: Float64Array } | null = null;
  private solid = 0;

  /** Counts the solid pixels of `pixels` (RGBA, alpha under 128 is see-through and skipped). */
  add(pixels: ArrayLike<number>): void {
    const n = pixels.length - (pixels.length % 4);
    let last = -1;
    for (let i = 0; i < n; i += 4) {
      if (pixels[i + 3] < SOLID) continue;
      const k = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
      this.solid++;
      if (this.bins) {
        this.addBinned(k);
        continue;
      }
      if (k === last) {
        // A run of one colour: bump the slot found last time.
        this.slotCount[this.find(k)]++;
        continue;
      }
      last = k;
      const s = this.find(k);
      if (this.slotCount[s] === 0) {
        this.slotKey[s] = k;
        if (++this.used > EXACT_LIMIT) {
          this.slotCount[s] = 1;
          this.toBins();
          continue;
        }
      }
      this.slotCount[s]++;
    }
  }

  private find(k: number): number {
    let s = Math.imul(k, 0x9e3779b1) >>> (32 - 17);
    while (this.slotCount[s] !== 0 && this.slotKey[s] !== k) s = (s + 1) & (SLOTS - 1);
    return s;
  }

  private addBinned(k: number): void {
    const b = this.bins!;
    const r = (k >> 16) & 255;
    const g = (k >> 8) & 255;
    const bl = k & 255;
    const at = ((r >> 3) << 10) | ((g >> 3) << 5) | (bl >> 3);
    b.r[at] += r;
    b.g[at] += g;
    b.b[at] += bl;
    b.n[at]++;
  }

  private toBins(): void {
    this.bins = { r: new Float64Array(BINS), g: new Float64Array(BINS), b: new Float64Array(BINS), n: new Float64Array(BINS) };
    const b = this.bins;
    for (let s = 0; s < SLOTS; s++) {
      const c = this.slotCount[s];
      if (!c) continue;
      const k = this.slotKey[s];
      const r = (k >> 16) & 255;
      const g = (k >> 8) & 255;
      const bl = k & 255;
      const at = ((r >> 3) << 10) | ((g >> 3) << 5) | (bl >> 3);
      b.r[at] += r * c;
      b.g[at] += g * c;
      b.b[at] += bl * c;
      b.n[at] += c;
    }
    this.slotKey = new Uint32Array(0);
    this.slotCount = new Uint32Array(0);
  }

  /** The colours counted so far. Most used first (then by colour), so the result never depends on the order of counting. */
  table(): ColourTable {
    const rows: { k: number; w: number }[] = [];
    if (this.bins) {
      const b = this.bins;
      for (let i = 0; i < BINS; i++) {
        const w = b.n[i];
        if (w) rows.push({ k: (Math.round(b.r[i] / w) << 16) | (Math.round(b.g[i] / w) << 8) | Math.round(b.b[i] / w), w });
      }
    } else {
      for (let s = 0; s < SLOTS; s++) if (this.slotCount[s]) rows.push({ k: this.slotKey[s], w: this.slotCount[s] });
    }
    rows.sort((a, c) => c.w - a.w || a.k - c.k);
    return { keys: Uint32Array.from(rows, (r) => r.k), weights: Float64Array.from(rows, (r) => r.w), exact: !this.bins, solid: this.solid };
  }
}

/** A table straight from pixels, in one go (tests and small pictures; big pictures feed a Histogram in chunks). */
export function tableOf(pixels: ArrayLike<number>): ColourTable {
  const h = new Histogram();
  h.add(pixels);
  return h.table();
}

// How much a step in each channel is felt: green most, blue least.
const WR = 3;
const WG = 4;
const WB = 2;

interface Box {
  lo: number;
  hi: number;
  /** Weighted squared error of the colours in the box around their mean, the thing a cut tries to lower. */
  sse: number;
  /** The channel (0 R, 1 G, 2 B) with the most spread. */
  channel: number;
}

const chan = (k: number, c: number): number => (k >> (16 - c * 8)) & 255;

/** Takes at most `max` colours for the table, as packed 0xRRGGBB, yielding a 0..1 progress between steps. */
export function* pickSteps(table: ColourTable, max: number): Generator<number, number[]> {
  const n = table.keys.length;
  const limit = Math.max(1, Math.floor(max));
  if (n <= limit) return Array.from(table.keys);

  const { keys, weights } = table;
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;

  const measure = (lo: number, hi: number): Box => {
    let w = 0;
    const sum = [0, 0, 0];
    const sq = [0, 0, 0];
    for (let i = lo; i < hi; i++) {
      const k = keys[order[i]];
      const c = weights[order[i]];
      w += c;
      for (let ch = 0; ch < 3; ch++) {
        const v = chan(k, ch);
        sum[ch] += v * c;
        sq[ch] += v * v * c;
      }
    }
    const spread = [0, 1, 2].map((ch) => (sq[ch] - (sum[ch] * sum[ch]) / w) * [WR, WG, WB][ch]);
    let channel = 0;
    if (spread[1] > spread[channel]) channel = 1;
    if (spread[2] > spread[channel]) channel = 2;
    return { lo, hi, sse: spread[0] + spread[1] + spread[2], channel };
  };

  const boxes: Box[] = [measure(0, n)];
  while (boxes.length < limit) {
    let pick = -1;
    let worst = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.hi - b.lo < 2 || b.sse <= worst) continue;
      worst = b.sse;
      pick = i;
    }
    if (pick < 0) break;
    const b = boxes[pick];
    const c = b.channel;
    const part = order.subarray(b.lo, b.hi);
    part.sort((x, y) => chan(keys[x], c) - chan(keys[y], c) || x - y);
    // Cut where half the pixels are on each side, so busy colours get more boxes.
    let total = 0;
    for (let i = b.lo; i < b.hi; i++) total += weights[order[i]];
    let acc = 0;
    let cut = b.lo + 1;
    for (let i = b.lo; i < b.hi - 1; i++) {
      acc += weights[order[i]];
      cut = i + 1;
      if (acc >= total / 2) break;
    }
    boxes.splice(pick, 1, measure(b.lo, cut), measure(cut, b.hi));
    yield (boxes.length / limit) * 0.5;
  }

  // The centres: each box's average colour.
  const cr: number[] = [];
  const cg: number[] = [];
  const cb: number[] = [];
  for (const b of boxes) {
    let w = 0;
    let r = 0;
    let g = 0;
    let bl = 0;
    for (let i = b.lo; i < b.hi; i++) {
      const k = keys[order[i]];
      const c = weights[order[i]];
      w += c;
      r += chan(k, 0) * c;
      g += chan(k, 1) * c;
      bl += chan(k, 2) * c;
    }
    cr.push(r / w);
    cg.push(g / w);
    cb.push(bl / w);
  }

  // A few rounds of k-means over the table: every colour goes to its nearest centre, and the centres move to the middle of theirs.
  const k = cr.length;
  const ROUNDS = 4;
  const STEP = 2048;
  for (let round = 0; round < ROUNDS; round++) {
    const sr = new Float64Array(k);
    const sg = new Float64Array(k);
    const sb = new Float64Array(k);
    const sw = new Float64Array(k);
    for (let start = 0; start < n; start += STEP) {
      const end = Math.min(n, start + STEP);
      for (let i = start; i < end; i++) {
        const key = keys[i];
        const r = (key >> 16) & 255;
        const g = (key >> 8) & 255;
        const b = key & 255;
        let best = 0;
        let bd = Infinity;
        for (let j = 0; j < k; j++) {
          const dr = r - cr[j];
          const dg = g - cg[j];
          const db = b - cb[j];
          const d = WR * dr * dr + WG * dg * dg + WB * db * db;
          if (d < bd) {
            bd = d;
            best = j;
          }
        }
        const w = weights[i];
        sr[best] += r * w;
        sg[best] += g * w;
        sb[best] += b * w;
        sw[best] += w;
      }
      yield 0.5 + ((round + end / n) / ROUNDS) * 0.5;
    }
    for (let j = 0; j < k; j++) {
      if (!sw[j]) continue;
      cr[j] = sr[j] / sw[j];
      cg[j] = sg[j] / sw[j];
      cb[j] = sb[j] / sw[j];
    }
  }

  // Round to whole colours, drop doubles, most used first.
  const seen = new Set<number>();
  const out: number[] = [];
  for (let j = 0; j < k; j++) {
    const key = (Math.round(cr[j]) << 16) | (Math.round(cg[j]) << 8) | Math.round(cb[j]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** `pickSteps` in one go. */
export function pickColours(table: ColourTable, max: number): number[] {
  const g = pickSteps(table, max);
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
  }
}

/** The smallest and largest limit a person can ask for (a palette holds 256). */
export const MIN_COLOURS = 2;
export const MAX_COLOURS = 256;
export const DEFAULT_COLOURS = 32;

/** A limit typed in by a person, made a whole number in range. */
export function clampColours(v: unknown, fallback = DEFAULT_COLOURS): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(MIN_COLOURS, Math.min(MAX_COLOURS, n)) : fallback;
}
