// Tips to stand in for the built in shapes of Procreate's that a .brush only names (`Brush-Preset-Blotch.jpg`,
// `Brush-Pocket-Brick.png`). Each is drawn here from a fixed recipe and matched by eye against Procreate's own picture
// of a stroke made with it, never copied from it. A tip is a square or a brick of paint, 0 to 255, which the importer
// then treats exactly as it treats a tip picture that came inside a file. Pure, no DOM.

export interface StandInTip {
  w: number;
  h: number;
  /** How much paint the tip lays at pixel (x, y), 0 to 255. */
  paint: (x: number, y: number) => number;
  what: string;
}

/** A number from two whole numbers and a seed, the same every time, 0 to 1. */
function hash(a: number, b: number, seed: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const ease = (t: number): number => t * t * (3 - 2 * t);

/** Smooth noise with a grid `s` pixels apart (no wrapping: a tip is drawn once, not repeated). */
function noise(x: number, y: number, s: number, seed: number): number {
  const gx = x / s;
  const gy = y / s;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = ease(gx - ix);
  const fy = ease(gy - iy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Ragged: speck sized and blotch sized bumps together, 0 to 1, with 0.5 the middle. */
const ragged = (x: number, y: number, seed: number): number => noise(x, y, 2, seed) * 0.45 + noise(x, y, 5, seed + 1) * 0.35 + noise(x, y, 11, seed + 2) * 0.2;

/** Dust: a finer ragged, for the edge of a tip that is meant to look rubbed rather than blotted. */
const dust = (x: number, y: number, seed: number): number => noise(x, y, 1.5, seed) * 0.45 + noise(x, y, 3, seed + 1) * 0.35 + noise(x, y, 7, seed + 2) * 0.2;

/** A coarser dust, for a tip that is drawn small: a pen of 40 pixels is this stamp shrunk threefold, so finer specks vanish. */
const grist = (x: number, y: number, seed: number): number => noise(x, y, 2.5, seed) * 0.4 + noise(x, y, 5, seed + 1) * 0.35 + noise(x, y, 10, seed + 2) * 0.25;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * The paint at a spot `d` of the way out to the rim (0 middle, 1 rim): solid in the middle, fading over the last `ramp`
 * of the way, with `grit` (0 to 1, middle 0.5) shoving the fade in and out by up to `rough` of it, so the edge is ragged
 * rather than a clean ring.
 */
const edge = (d: number, ramp: number, grit: number, rough: number): number => smooth(clamp01((1 - d) / ramp + (grit - 0.5) * rough));

const SIDE = 128;

/**
 * A blotch: a round dab whose edge wanders in and out and frays into specks, soft rather than cut. Procreate's
 * Background brush has an edge like this, a ragged blur, and so do the pens that use the same tip.
 */
function blotch(): StandInTip {
  const half = SIDE / 2;
  return {
    w: SIDE,
    h: SIDE,
    what: 'a blotch with a ragged soft edge',
    paint: (x, y) => {
      const dx = (x + 0.5 - half) / half;
      const dy = (y + 0.5 - half) / half;
      const d = Math.hypot(dx, dy);
      const t = Math.atan2(dy, dx);
      const rim = 0.94 + 0.04 * Math.sin(3 * t + 0.6) + 0.03 * Math.sin(5 * t + 2.1) + 0.02 * Math.sin(9 * t + 4.0) + 0.012 * Math.sin(17 * t + 1.3);
      return Math.round(255 * edge(d / rim, 0.3, ragged(x, y, 71), 1.1));
    },
  };
}

/**
 * A brick: a blunt block with its corners well rounded and its edge fraying. It is square, not oblong: a longer tip turns
 * with the line and widens it (a first try, twice as long as it was tall, drew the 6B Pencil's stroke twice as wide as
 * Procreate's), and what the picture of the stroke shows is a blunt, rubbed edge, which is what this keeps.
 */
function brick(): StandInTip {
  const w = SIDE;
  const h = SIDE;
  return {
    w,
    h,
    what: 'a blunt block with a rough edge',
    paint: (x, y) => {
      const nx = (x + 0.5 - w / 2) / (w / 2);
      const ny = (y + 0.5 - h / 2) / (h / 2);
      // A rounded box: its corners are cut so that a tip that turns as it goes does not show them.
      const d = (Math.abs(nx) ** 2.5 + Math.abs(ny) ** 2.5) ** (1 / 2.5);
      return Math.round(255 * edge(d, 0.35, dust(x, y, 81), 0.9));
    },
  };
}

/** A round with a rough edge, nearly hard: a pen that is not quite clean, as an ink pen on rough paper. */
function roughRound(): StandInTip {
  const half = SIDE / 2;
  return {
    w: SIDE,
    h: SIDE,
    what: 'a round with a rough edge',
    paint: (x, y) => {
      const d = Math.hypot((x + 0.5 - half) / half, (y + 0.5 - half) / half);
      return Math.round(255 * edge(d, 0.16, grist(x, y, 91), 1.1));
    },
  };
}

const MADE: Record<string, StandInTip> = {};
const make = (key: string, f: () => StandInTip): StandInTip => (MADE[key] ??= f());

/** The tip drawn for a named Procreate shape (`onSoftPaper`: the brush's paper is a soft one), or null when none is drawn for it (it then comes as a plain round tip). */
export function standInTip(name: string, onSoftPaper = false): StandInTip | null {
  // The same Blotch is under a soft paper's brush and under the inking pens: soft and frayed in one, a rough clean line in the other.
  if (/blotch/i.test(name)) return onSoftPaper ? make('blotch', blotch) : make('rough', roughRound);
  if (/brick/i.test(name)) return make('brick', brick);
  return null;
}
