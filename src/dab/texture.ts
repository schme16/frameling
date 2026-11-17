/**
 * Texture for the pixel brush: grain (a paper the paint catches on) and a dual brush (a second tip that only lets paint
 * through where its dots are). Both are small tiles that repeat across the page and are looked up one pixel at a time, so
 * a stroke pays one array read per pixel for each. The grain is the same paper the dry media (chalk, charcoal) use, so a
 * paper added there turns up here, and the other way round. Pure functions, no DOM.
 */
import { isPaper, paperTile, TILE, type PaperKind } from '../dry/paper';
import { cleanLaid, sameLaid, type LaidTip } from './dualLaid';
import { cleanPicture, dualPictureScale, dualTileFromPicture, grainTileFromPicture, samePicture, scaleTile, type TexturePicture } from './texturePicture';

/** A paper the paint catches on. */
export interface Grain {
  /** A paper this brush keeps for itself. Left out, the brush catches on the sheet's paper, the same one chalk and charcoal use. */
  paper?: PaperKind;
  /** A picture the paint catches on instead of any paper: it catches on the light parts. Set, `paper` and the sheet's paper do not count. */
  picture?: TexturePicture;
  /** With a picture: it catches on the dark parts instead of the light ones. */
  invert?: boolean;
  /** 0 (paper makes no difference) to 1 (paint only lands on the high points the dab reaches). */
  depth: number;
  /** Pixels of page one pixel of the paper covers: 1 is the finest grain. Whole pixels, unless `smooth` is on. */
  scale: number;
  /**
   * True: a paper bigger than the finest is blown up smoothly, so a big soft pencil has a soft grain, and `scale` may have
   * a fraction. Left out: it is blown up in sharp blocks of whole pixels, which is right for pixel art. A pixel (aliased)
   * brush always uses blocks.
   */
  smooth?: boolean;
  /** False: the paper is fixed to the page, so strokes over each other catch on the same bumps. True: every dab finds the paper in a new place. */
  moving: boolean;
  /**
   * True: the paper thins every dab instead of stopping it, so a light touch is an even grey with the paper showing
   * through. That is how Procreate's grain works, and a brush read from one of its files has it set. Left out: the
   * paper stops paint that cannot reach a pit, so a light touch is specks on the peaks. Either way a paper that stays
   * put says how dark a pixel may ever get in one stroke.
   */
  thin?: boolean;
  /**
   * With a paper that stays put: how much of its depth holds the whole stroke back, 0 (dabs over each other fill every
   * pit in the end) to 1 (a pit never takes more than the paper lets it). Left out: 1.
   */
  hold?: number;
}

/** A second tip: dots that the first tip is let through (or cut by). */
export interface Dual {
  tip: 'round' | 'square';
  /** Pixels across one dot. */
  size: number;
  /** About how much of the page the dots cover, 0.05 to 1. */
  density: number;
  /** False: paint lands only inside the dots. True: the dots are holes in it. */
  cut: boolean;
  /** Dots from a picture instead of round or square ones: its darkest parts are the dots (`density` says how much of it counts), `tip` and `size` do not count. */
  picture?: TexturePicture;
  /** With a picture: the light parts are the dots instead of the dark ones. */
  invert?: boolean;
  /** With a picture: how many pixels one picture pixel covers (1, 2, 4 or 8, as far as the picture fits the tile). */
  scale?: number;
  /**
   * A second brush laid along the stroke on its own spacing, instead of a field of dots: the first brush only paints where
   * this one's stroke is (its paint is multiplied by it). Set, `tip`, `size`, `density`, `picture` and `cut` do not count.
   */
  laid?: LaidTip;
}

export const GRAIN_SCALE = { min: 1, max: 8 };
/** The sizes a smooth paper may be, fractions included. Under 1 the paper is shrunk, over it blown up. */
export const SMOOTH_GRAIN_SCALE = { min: 0.25, max: 8 };
export const DUAL_SIZE = { min: 1, max: 64 };
export const DUAL_DENSITY = { min: 0.05, max: 1 };
export const DUAL_PICTURE_SCALE = { min: 1, max: 8 };
export const DEFAULT_GRAIN: Grain = { depth: 0.8, scale: 1, moving: false };
export const DEFAULT_DUAL: Dual = { tip: 'round', size: 3, density: 0.4, cut: false };

const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** A grain read from saved data: null when there is none, and a whole one with anything odd put right. */
export function cleanGrain(raw: unknown): Grain | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const picture = cleanPicture(r.picture);
  return {
    ...(isPaper(r.paper) ? { paper: r.paper } : {}),
    ...(picture ? { picture, ...(r.invert === true ? { invert: true } : {}) } : {}),
    depth: r3(num(r.depth, 0, 1, DEFAULT_GRAIN.depth)),
    scale: r.smooth === true ? r3(num(r.scale, SMOOTH_GRAIN_SCALE.min, SMOOTH_GRAIN_SCALE.max, 1)) : Math.round(num(r.scale, GRAIN_SCALE.min, GRAIN_SCALE.max, 1)),
    moving: r.moving === true,
    ...(r.smooth === true ? { smooth: true } : {}),
    ...(r.thin === true ? { thin: true } : {}),
    ...(typeof r.hold === 'number' && Number.isFinite(r.hold) && r.hold < 1 ? { hold: r3(Math.max(0, r.hold)) } : {}),
  };
}

/** A dual brush read from saved data, same rules. */
export function cleanDual(raw: unknown): Dual | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const picture = cleanPicture(r.picture);
  const laid = cleanLaid(r.laid);
  return {
    ...(picture ? { picture, ...(r.invert === true ? { invert: true } : {}), scale: dualPictureScale(picture.side, typeof r.scale === 'number' ? r.scale : 1) } : {}),
    ...(laid ? { laid } : {}),
    tip: r.tip === 'square' ? 'square' : 'round',
    size: Math.round(num(r.size, DUAL_SIZE.min, DUAL_SIZE.max, DEFAULT_DUAL.size)),
    density: r3(num(r.density, DUAL_DENSITY.min, DUAL_DENSITY.max, DEFAULT_DUAL.density)),
    cut: r.cut === true,
  };
}

export const sameGrain = (a: Grain | null, b: Grain | null): boolean => (a === null || b === null ? a === b : a.paper === b.paper && samePicture(a.picture, b.picture) && !!a.invert === !!b.invert && Math.abs(a.depth - b.depth) < 1e-6 && a.scale === b.scale && !!a.smooth === !!b.smooth && a.moving === b.moving && !!a.thin === !!b.thin && Math.abs((a.hold ?? 1) - (b.hold ?? 1)) < 1e-6);
export const sameDual = (a: Dual | null, b: Dual | null): boolean => (a === null || b === null ? a === b : a.tip === b.tip && a.size === b.size && samePicture(a.picture, b.picture) && !!a.invert === !!b.invert && (a.scale ?? 1) === (b.scale ?? 1) && Math.abs(a.density - b.density) < 1e-6 && a.cut === b.cut && sameLaid(a.laid, b.laid));

/**
 * How much of a dab's paint a pixel catches, given the paint on offer (0 to 1) and the paper's height there (0 a pit, 1 a
 * peak). At depth 0 every pixel takes all of it. At depth 1 a pixel takes nothing until the paint reaches how deep its
 * pit is, so light paint lands on the peaks first and pressing harder (more flow) reaches down into the pits.
 *
 * That is the same way round as the dry media, where `pitDepth` in src/dry/maths.ts takes pigment on the peaks first,
 * the way real chalk catches on the tooth of the paper. It used to be the other way: see the board card
 * grain-peaks-or-pits and the look look-grain-dir. On the built-in papers the two directions are impossible to tell
 * apart, because the tiles are evenly spread, so only a picture used as grain shows it, and there the paint now catches
 * on the light parts (a photo of canvas lights the thread tops), with `invert` to swap it back.
 * test/dab/grain-direction.test.ts pins the direction so it cannot drift again.
 */
export function grainCut(add: number, height: number, depth: number): number {
  const lift = depth * (1 - height);
  if (add <= lift) return 0;
  return (add - lift) / (1 - lift);
}

/** Whether a grain is drawn smoothly: it asks for it, is not at the finest size, and the brush is not a pixel (aliased) one. */
export const grainIsSmooth = (g: Grain, aliased = false): boolean => !!g.smooth && !aliased && g.scale !== 1;

/**
 * The tile a grain catches on: its own picture when it has one, else its paper, else the sheet's. A smooth grain bigger or
 * smaller than the finest comes back already scaled (blown up with bilinear filtering), so it is `256 * scale` pixels across
 * and the loop reads it a pixel at a time with no scale of its own. Otherwise it is the 256 pixel tile, and the loop does the scale.
 */
export function grainTile(g: Grain, sheet?: PaperKind, aliased = false): Uint8Array {
  const base = g.picture ? grainTileFromPicture(g.picture, !!g.invert, !!g.thin) : paperTile(g.paper ?? sheet ?? 'medium');
  if (!grainIsSmooth(g, aliased)) return base;
  // A paper and a picture left as they are are not spread evenly; the rest are, and stay so after they are smoothed.
  const key = g.picture ? `${g.picture.side}|${g.invert ? 1 : 0}|${g.thin ? 1 : 0}|${g.picture.data}` : `p|${g.paper ?? sheet ?? 'medium'}`;
  return scaleTile(key, base, g.scale, !(g.picture && g.thin));
}

/** How many pixels across a grain tile is: 256 for a plain one, more or fewer for a smooth one that was scaled. */
export const tileSide = (t: Uint8Array): number => Math.round(Math.sqrt(t.length));

/** The paper height (0 to 1) under page pixel (x, y), with the grain's scale and an offset for a paper that moves. */
export function grainHeight(g: { paper: PaperKind; scale: number }, x: number, y: number, ox = 0, oy = 0): number {
  const t = paperTile(g.paper);
  const sx = g.scale > 1 ? Math.floor(x / g.scale) : x;
  const sy = g.scale > 1 ? Math.floor(y / g.scale) : y;
  return t[(((sy + oy) & (TILE - 1)) * TILE) + ((sx + ox) & (TILE - 1))] / 255;
}

/** The dither threshold a crisp pixel is judged against with a grain: the page's ordered dither at depth 0, nothing at depth 1 (the paper decides). */
export const grainThreshold = (bayer: number, depth: number): number => bayer * (1 - depth);

// ---------------------------------------------------------------- the dual tile

const duals = new Map<string, Uint8Array>();

/** A small seeded source of 0 to 1 numbers, so a dual brush always looks the same. */
function seeded(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How many dots it takes to cover about `density` of the tile: more than the plain share, since dots land on each other. */
export function dotCount(d: Dual): number {
  const area = d.tip === 'round' ? Math.PI * (d.size / 2) ** 2 : d.size * d.size;
  // With random placement the covered share is 1 - exp(-n * area / tile), so solve for n.
  const share = Math.min(0.98, d.density);
  return Math.max(1, Math.round((-Math.log(1 - share) * TILE * TILE) / Math.max(1, area)));
}

/**
 * The tile a dual brush paints through: 255 where a dot is, 0 where it is not (or the other way round for a cut). Dots are
 * placed at random but always the same random, wrap round the tile edges, and are made once per set of numbers, then kept.
 */
export function dualTile(d: Dual): Uint8Array {
  if (d.picture) return dualTileFromPicture(d.picture, d.density, !!d.invert, d.cut, d.scale);
  const key = `${d.tip}|${d.size}|${d.density}|${d.cut ? 1 : 0}`;
  const have = duals.get(key);
  if (have) return have;
  const t = new Uint8Array(TILE * TILE);
  const rnd = seeded(0x51ed + d.size * 131 + (d.tip === 'round' ? 1 : 2));
  const r = d.size / 2;
  const n = dotCount(d);
  const reach = Math.ceil(r) + 1;
  for (let i = 0; i < n; i++) {
    const cx = rnd() * TILE;
    const cy = rnd() * TILE;
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const px = Math.floor(cx) + dx;
        const py = Math.floor(cy) + dy;
        const ox = px + 0.5 - cx;
        const oy = py + 0.5 - cy;
        const inside = d.tip === 'round' ? ox * ox + oy * oy < r * r : Math.abs(ox) < r && Math.abs(oy) < r;
        // A one pixel dot always lands on a pixel, whatever the fraction.
        if (inside || (d.size <= 1 && dx === 0 && dy === 0)) t[((py & (TILE - 1)) * TILE) + (px & (TILE - 1))] = 255;
      }
    }
  }
  if (d.cut) for (let i = 0; i < t.length; i++) t[i] = 255 - t[i];
  duals.set(key, t);
  return t;
}

/** Whether the dual lets paint through at page pixel (x, y), with the stroke's own offset so each stroke gets its own scatter of dots. */
export const dualAt = (tile: Uint8Array, x: number, y: number, ox: number, oy: number): boolean => tile[(((y + oy) & (TILE - 1)) * TILE) + ((x + ox) & (TILE - 1))] !== 0;
