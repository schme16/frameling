// Brush tips: what they are, their defaults, and how a saved or shared one is read back. Pure, no DOM. The shapes a tip
// draws are worked out in tipShapes.ts; the picker is in src/brushes.
import type { BrushSettings, BrushTip, StampAngle, StampShape, TipKind, TipPieces } from '../core/format';

export interface TipInfo {
  id: TipKind;
  label: string;
  /** One plain line for the picker's hint. */
  hint: string;
}

/** The tips, in the order the picker shows them (Plain is the picker's own first choice). */
export const TIPS: readonly TipInfo[] = [
  { id: 'chalk', label: 'Chalk', hint: 'A soft, dusty line with the paper showing through.' },
  { id: 'charcoal', label: 'Charcoal', hint: 'A rough, grainy line with a ragged edge, for sketching and shading.' },
  { id: 'watercolour', label: 'Watercolour', hint: 'A see-through wash that is darker and bolder at the edge.' },
  { id: 'stamp', label: 'Stamp', hint: 'Scatters a shape along the line, a little off it and a little turned: leaves, stars, dashes, or a drawing of your own.' },
  { id: 'nib', label: 'Pen nib', hint: 'A flat or oval pen point at an angle, so the line is thick one way and thin the other, like calligraphy.' },
  { id: 'along', label: 'Along the line', hint: 'Your own drawing, stretched or repeated down the whole line and bending with it.' },
  { id: 'edged', label: 'Edged', hint: 'Different drawings for the sides, the two ends and the corners, laid along the line. Good for chains and borders.' },
  { id: 'bristle', label: 'Bristles', hint: 'Lots of thin lines side by side that wobble and run dry, like a real paintbrush.' },
];

/** The kinds that are made from a drawing of your own, rather than a built-in shape. */
export const isDrawingTip = (k: TipKind | undefined): boolean => k === 'along' || k === 'edged';
/** The kinds with random parts that need a seed to stay put. */
export const usesSeed = (k: TipKind | undefined): boolean => k === 'stamp' || k === 'bristle';

export const STAMPS: readonly { id: StampShape; label: string; angle: StampAngle }[] = [
  { id: 'leaf', label: 'Leaf', angle: 'follow' },
  { id: 'dash', label: 'Dash', angle: 'follow' },
  { id: 'dot', label: 'Dot', angle: 'upright' },
  { id: 'star', label: 'Star', angle: 'random' },
  { id: 'diamond', label: 'Diamond', angle: 'follow' },
  { id: 'heart', label: 'Heart', angle: 'upright' },
];

/** The most points a custom stamp keeps (all its outlines together), so a brush stays small in a file. */
export const MAX_CUSTOM_POINTS = 90;
export const MAX_CUSTOM_RINGS = 8;
/** A drawing laid along the line (along, edged) keeps more points, because it is bent and shown big. Each piece of an edged brush has its own share. */
export const MAX_TILE_POINTS = 240;
export const MAX_TILE_RINGS = 12;

const r4 = (v: number) => Math.round(v * 10000) / 10000 || 0;

/** A pointed ribbon, long and thin: the drawing a new "Along the line" brush starts with (1 long, flat under it). */
export function startRibbon(): number[][] {
  const o: number[] = [];
  const n = 16;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    o.push(r4(-0.5 + t), r4(-0.07 * Math.pow(Math.sin(Math.PI * t), 0.7)));
  }
  for (let i = n - 1; i >= 1; i--) {
    const t = i / n;
    o.push(r4(-0.5 + t), r4(0.07 * Math.pow(Math.sin(Math.PI * t), 0.7)));
  }
  return [o];
}

/** A rounded oval ring with an open middle: the link a new "Edged" brush starts with, so it draws a chain. */
export function startLink(): number[][] {
  const stadium = (w: number, h: number): number[] => {
    const o: number[] = [];
    const r = h / 2;
    for (let i = 0; i <= 8; i++) {
      const a = -Math.PI / 2 + (i / 8) * Math.PI;
      o.push(r4(w / 2 - r + Math.cos(a) * r), r4(Math.sin(a) * r));
    }
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI / 2 + (i / 8) * Math.PI;
      o.push(r4(-w / 2 + r + Math.cos(a) * r), r4(Math.sin(a) * r));
    }
    return o;
  };
  return [stadium(1, 0.56), stadium(0.64, 0.24)];
}

/** A tip with every field filled in. */
export interface ResolvedTip {
  kind: TipKind;
  amount: number;
  grain: number;
  shape: StampShape;
  spacing: number;
  jitter: number;
  angle: StampAngle;
  scatter: number;
  custom: number[][];
  seed: number;
  turn: number;
  fixedSize: boolean;
  gapVary: number;
  roundness: number;
  nibAngle: number;
  fit: 'stretch' | 'repeat';
  pieces: TipPieces;
  count: number;
  stiffness: number;
}

type Plain = Omit<ResolvedTip, 'kind' | 'custom' | 'seed' | 'pieces'>;
const BASE: Plain = { amount: 0.6, grain: 1, shape: 'leaf', spacing: 1, jitter: 0, angle: 'follow', scatter: 0, turn: 0, fixedSize: false, gapVary: 0, roundness: 0.3, nibAngle: 40, fit: 'stretch', count: 14, stiffness: 0.6 };
const DEFAULTS: Record<TipKind, Plain> = {
  chalk: BASE,
  charcoal: { ...BASE, amount: 0.75, grain: 1.2 },
  watercolour: BASE,
  stamp: { ...BASE, amount: 0.5, spacing: 1.1, jitter: 0.25, scatter: 0.15 },
  nib: { ...BASE, angle: 'upright' },
  along: BASE,
  edged: BASE,
  bristle: { ...BASE, amount: 0.25 },
};

/** A new tip of a kind, with the usual settings for it. */
export function defaultTip(kind: TipKind): BrushTip {
  const d = DEFAULTS[kind];
  if (kind === 'stamp') return { kind, shape: d.shape, spacing: d.spacing, jitter: d.jitter, angle: d.angle, scatter: d.scatter };
  if (kind === 'watercolour') return { kind, amount: d.amount };
  if (kind === 'nib') return { kind, roundness: d.roundness, nibAngle: d.nibAngle, angle: d.angle };
  if (kind === 'along') return { kind, custom: startRibbon(), fit: d.fit };
  if (kind === 'edged') return { kind, custom: startLink() };
  if (kind === 'bristle') return { kind, count: d.count, stiffness: d.stiffness, amount: d.amount };
  return { kind, amount: d.amount, grain: d.grain };
}

export function resolveTip(t: BrushTip): ResolvedTip {
  const d = DEFAULTS[t.kind];
  return {
    kind: t.kind,
    amount: t.amount ?? d.amount,
    grain: t.grain ?? d.grain,
    shape: t.shape ?? d.shape,
    spacing: t.spacing ?? d.spacing,
    jitter: t.jitter ?? d.jitter,
    angle: t.angle ?? d.angle,
    scatter: t.scatter ?? d.scatter,
    custom: t.custom ?? [],
    seed: t.seed ?? 1,
    turn: t.turn ?? d.turn,
    fixedSize: t.fixedSize ?? d.fixedSize,
    gapVary: t.gapVary ?? d.gapVary,
    roundness: t.roundness ?? d.roundness,
    nibAngle: t.nibAngle ?? d.nibAngle,
    fit: t.fit ?? d.fit,
    pieces: t.pieces ?? {},
    count: Math.round(t.count ?? d.count),
    stiffness: t.stiffness ?? d.stiffness,
  };
}

const KINDS = new Set<string>(['chalk', 'charcoal', 'watercolour', 'stamp', 'nib', 'along', 'edged', 'bristle']);
const SHAPES = new Set<string>(['dot', 'leaf', 'star', 'diamond', 'dash', 'heart', 'custom']);
const ANGLES = new Set<string>(['follow', 'upright', 'random']);

const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);


/** A custom stamp read back: a few closed outlines of finite numbers near the middle, or nothing. */
export function readCustom(raw: unknown, maxPoints = MAX_CUSTOM_POINTS, maxRings = MAX_CUSTOM_RINGS, digits = 1000): number[][] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: number[][] = [];
  let points = 0;
  for (const ring of raw.slice(0, maxRings)) {
    if (!Array.isArray(ring) || ring.length < 6 || ring.length % 2) continue;
    if (points + ring.length / 2 > maxPoints) break;
    const r: number[] = [];
    for (const v of ring) {
      const n = num(v, -2, 2);
      if (n === undefined) break;
      r.push(Math.round(n * digits) / digits);
    }
    if (r.length !== ring.length) continue;
    points += r.length / 2;
    out.push(r);
  }
  return out.length ? out : undefined;
}

/**
 * Reads a tip out of saved or shared data. Anything that isn't a tip gives undefined (a plain line); a field that is off
 * is left out so its usual value applies. A custom stamp with no outlines falls back to the leaf.
 */
export function readTip(raw: unknown): BrushTip | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.kind !== 'string' || !KINDS.has(r.kind)) return undefined;
  const tip: BrushTip = { kind: r.kind as TipKind };
  const amount = num(r.amount, 0, 1);
  if (amount !== undefined) tip.amount = amount;
  const grain = num(r.grain, 0.5, 3);
  if (grain !== undefined) tip.grain = grain;
  if (tip.kind === 'stamp') {
    if (typeof r.shape === 'string' && SHAPES.has(r.shape)) tip.shape = r.shape as StampShape;
    const spacing = num(r.spacing, 0.2, 4);
    if (spacing !== undefined) tip.spacing = spacing;
    const jitter = num(r.jitter, 0, 1);
    if (jitter !== undefined) tip.jitter = jitter;
    if (typeof r.angle === 'string' && ANGLES.has(r.angle)) tip.angle = r.angle as StampAngle;
    const scatter = num(r.scatter, 0, 2);
    if (scatter !== undefined) tip.scatter = scatter;
    const custom = readCustom(r.custom);
    if (custom) tip.custom = custom;
    if (tip.shape === 'custom' && !custom) delete tip.shape;
    const turn = num(r.turn, 0, 1);
    if (turn !== undefined) tip.turn = turn;
    if (r.fixedSize === true) tip.fixedSize = true;
    const gapVary = num(r.gapVary, 0, 1);
    if (gapVary !== undefined) tip.gapVary = gapVary;
  }
  if (tip.kind === 'nib') {
    const roundness = num(r.roundness, 0.05, 1);
    if (roundness !== undefined) tip.roundness = roundness;
    const nibAngle = num(r.nibAngle, -90, 90);
    if (nibAngle !== undefined) tip.nibAngle = Math.round(nibAngle);
    if (typeof r.angle === 'string' && ANGLES.has(r.angle)) tip.angle = r.angle as StampAngle;
  }
  if (tip.kind === 'along' || tip.kind === 'edged') {
    // A drawing with no outlines left has nothing to lay along the line: it falls back to a plain line.
    const custom = readCustom(r.custom, MAX_TILE_POINTS, MAX_TILE_RINGS, 10000);
    if (!custom) return undefined;
    tip.custom = custom;
    if (tip.kind === 'along' && (r.fit === 'repeat' || r.fit === 'stretch')) tip.fit = r.fit;
    if (tip.kind === 'edged' && r.pieces && typeof r.pieces === 'object' && !Array.isArray(r.pieces)) {
      const pr = r.pieces as Record<string, unknown>;
      const pieces: TipPieces = {};
      for (const k of ['start', 'end', 'inner', 'outer'] as const) {
        const rings = readCustom(pr[k], MAX_TILE_POINTS, MAX_TILE_RINGS, 10000);
        if (rings) pieces[k] = rings;
      }
      if (Object.keys(pieces).length) tip.pieces = pieces;
    }
  }
  if (tip.kind === 'bristle') {
    const count = num(r.count, 3, 60);
    if (count !== undefined) tip.count = Math.round(count);
    const stiffness = num(r.stiffness, 0, 1);
    if (stiffness !== undefined) tip.stiffness = stiffness;
  }
  if (usesSeed(tip.kind)) {
    const seed = num(r.seed, 1, 2 ** 31 - 1);
    if (seed !== undefined) tip.seed = Math.round(seed);
  }
  return tip;
}

const close = (a: number | undefined, b: number | undefined, d: number): boolean => Math.abs((a ?? d) - (b ?? d)) < 1e-6;

/** True when two tips are the same tip (the random seed doesn't count: it only keeps one drawn line steady). */
export function sameTip(a: BrushTip | undefined, b: BrushTip | undefined): boolean {
  if (!a || !b) return !a && !b;
  if (a.kind !== b.kind) return false;
  const x = resolveTip(a);
  const y = resolveTip(b);
  if (!close(x.amount, y.amount, 0) || !close(x.grain, y.grain, 1)) return false;
  if (a.kind === 'nib') return x.angle === y.angle && close(x.roundness, y.roundness, 0.3) && close(x.nibAngle, y.nibAngle, 40);
  if (a.kind === 'bristle') return x.count === y.count && close(x.stiffness, y.stiffness, 0.6);
  if (a.kind === 'along' || a.kind === 'edged') return x.fit === y.fit && JSON.stringify(x.custom) === JSON.stringify(y.custom) && JSON.stringify(x.pieces) === JSON.stringify(y.pieces);
  if (a.kind !== 'stamp') return true;
  return x.shape === y.shape && x.angle === y.angle && close(x.spacing, y.spacing, 1) && close(x.jitter, y.jitter, 0) && close(x.scatter, y.scatter, 0) && close(x.turn, y.turn, 0) && x.fixedSize === y.fixedSize && close(x.gapVary, y.gapVary, 0) && JSON.stringify(x.custom) === JSON.stringify(y.custom);
}

/** The tip as it is kept on a drawn line: the same, with its random seed. */
export const withSeed = (tip: BrushTip, seed: number): BrushTip => (usesSeed(tip.kind) ? { ...tip, seed } : tip);

/** The brush as drawn on a line: the seed set when it is a stamp that wants one, and nothing else changed. */
export function brushForLine(b: BrushSettings, seed: number): BrushSettings {
  return b.tip && usesSeed(b.tip.kind) && b.tip.seed === undefined ? { ...b, tip: withSeed(b.tip, seed) } : b;
}

/** The brush without its tip: a plain line. */
export function plainBrush(b: BrushSettings): BrushSettings {
  if (!b.tip) return b;
  const { tip: _tip, ...rest } = b;
  return rest;
}

/** True when the line is grain (chalk, charcoal): it is made of thousands of tiny shapes, which makes vector files bigger. */
export const isGrainy = (b: BrushSettings): boolean => b.tip?.kind === 'chalk' || b.tip?.kind === 'charcoal';

/** How far past the line's own outline a tip can paint, in document pixels (for working out a drawing's box). */
export function tipReach(b: BrushSettings): number {
  const t = b.tip;
  if (!t) return 0;
  const r = resolveTip(t);
  if (t.kind === 'stamp') return b.size * (0.8 + r.scatter + r.jitter * 0.2);
  if (t.kind === 'watercolour') return b.size * 0.5;
  if (t.kind === 'nib') return b.size * 0.6;
  if (t.kind === 'along' || t.kind === 'edged') return b.size * 1.2;
  if (t.kind === 'bristle') return b.size * 0.8;
  return Math.max(2, 0.8 * r.grain * 2.2);
}

/** A short name for the tip, for a chip or a hint ("Chalk", "Leaf stamp"). */
export function tipName(t: BrushTip | undefined): string {
  if (!t) return 'Plain';
  if (t.kind === 'stamp') return t.shape === 'custom' ? 'Your stamp' : `${STAMPS.find((s) => s.id === (t.shape ?? 'leaf'))?.label ?? 'Leaf'} stamp`;
  return TIPS.find((x) => x.id === t.kind)?.label ?? 'Plain';
}
