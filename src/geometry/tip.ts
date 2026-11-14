// Brush tips: what they are, their defaults, and how a saved or shared one is read back. Pure, no DOM. The shapes a tip
// draws are worked out in tipShapes.ts; the picker is in src/brushes.
import type { BrushSettings, BrushTip, StampAngle, StampShape, TipKind } from '../core/format';

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
  { id: 'stamp', label: 'Stamp', hint: 'Repeats a shape along the line: leaves, stars, dashes, or a shape of your own.' },
];

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
}

const DEFAULTS: Record<TipKind, Omit<ResolvedTip, 'kind' | 'custom' | 'seed'>> = {
  chalk: { amount: 0.6, grain: 1, shape: 'leaf', spacing: 1, jitter: 0, angle: 'follow', scatter: 0 },
  charcoal: { amount: 0.75, grain: 1.2, shape: 'leaf', spacing: 1, jitter: 0, angle: 'follow', scatter: 0 },
  watercolour: { amount: 0.6, grain: 1, shape: 'leaf', spacing: 1, jitter: 0, angle: 'follow', scatter: 0 },
  stamp: { amount: 0.5, grain: 1, shape: 'leaf', spacing: 1.1, jitter: 0.25, angle: 'follow', scatter: 0.15 },
};

/** A new tip of a kind, with the usual settings for it. */
export function defaultTip(kind: TipKind): BrushTip {
  const d = DEFAULTS[kind];
  if (kind === 'stamp') return { kind, shape: d.shape, spacing: d.spacing, jitter: d.jitter, angle: d.angle, scatter: d.scatter };
  if (kind === 'watercolour') return { kind, amount: d.amount };
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
  };
}

const KINDS = new Set<string>(['chalk', 'charcoal', 'watercolour', 'stamp']);
const SHAPES = new Set<string>(['dot', 'leaf', 'star', 'diamond', 'dash', 'heart', 'custom']);
const ANGLES = new Set<string>(['follow', 'upright', 'random']);

const num = (v: unknown, lo: number, hi: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined);
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** A custom stamp read back: a few closed outlines of finite numbers near the middle, or nothing. */
export function readCustom(raw: unknown): number[][] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: number[][] = [];
  let points = 0;
  for (const ring of raw.slice(0, MAX_CUSTOM_RINGS)) {
    if (!Array.isArray(ring) || ring.length < 6 || ring.length % 2) continue;
    if (points + ring.length / 2 > MAX_CUSTOM_POINTS) break;
    const r: number[] = [];
    for (const v of ring) {
      const n = num(v, -2, 2);
      if (n === undefined) break;
      r.push(round3(n));
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
  if (a.kind !== 'stamp') return true;
  return x.shape === y.shape && x.angle === y.angle && close(x.spacing, y.spacing, 1) && close(x.jitter, y.jitter, 0) && close(x.scatter, y.scatter, 0) && JSON.stringify(x.custom) === JSON.stringify(y.custom);
}

/** The tip as it is kept on a drawn line: the same, with its random seed. */
export const withSeed = (tip: BrushTip, seed: number): BrushTip => (tip.kind === 'stamp' ? { ...tip, seed } : tip);

/** The brush as drawn on a line: the seed set when it is a stamp that wants one, and nothing else changed. */
export function brushForLine(b: BrushSettings, seed: number): BrushSettings {
  return b.tip && b.tip.kind === 'stamp' && b.tip.seed === undefined ? { ...b, tip: withSeed(b.tip, seed) } : b;
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
  return Math.max(2, 0.8 * r.grain * 2.2);
}

/** A short name for the tip, for a chip or a hint ("Chalk", "Leaf stamp"). */
export function tipName(t: BrushTip | undefined): string {
  if (!t) return 'Plain';
  if (t.kind === 'stamp') return t.shape === 'custom' ? 'Your stamp' : `${STAMPS.find((s) => s.id === (t.shape ?? 'leaf'))?.label ?? 'Leaf'} stamp`;
  return TIPS.find((x) => x.id === t.kind)?.label ?? 'Plain';
}
