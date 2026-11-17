/**
 * A dual tip that is laid along the stroke instead of being a field of dots: a second brush with its own tip, size,
 * spacing and scatter, drawn along the same line. Where its stroke is, the first brush may paint (the first brush's
 * paint is multiplied by it). A Procreate dual brush comes this way. Pure functions, no DOM.
 */
import { readPixelStamp, type PixelStamp } from '../brushes/stamps';

export interface LaidTip {
  tip: 'round' | 'square' | 'picture';
  /** The picture a picture tip paints with. */
  picture?: PixelStamp | null;
  /** How wide it is, as a share of the first brush's width at the moment. */
  size: number;
  /** 0 (soft) to 1 (a hard edge). Round and square tips only. */
  hardness: number;
  /** 0.05 (a sliver) to 1 (a full circle or square). */
  roundness: number;
  /** How far apart its dabs are, as a share of its own width. */
  spacing: number;
  /** How far a dab may land away from the line, as a share of its own width. */
  scatter: number;
  /** How far a dab may be turned at random, as a share of half a turn. */
  angleJitter: number;
  /** The tip turns to point along the line. */
  follow: boolean;
}

export const LAID_SIZE = { min: 0.05, max: 4 };
/** Closer than this and a hard dab leaves nothing a plain stroke would not, but costs more to lay. */
export const LAID_SPACING = { min: 0.02, max: 4 };
export const LAID_SCATTER = { min: 0, max: 2 };
/** The widest a laid dab is drawn, in pixels, whatever the share says. */
export const LAID_MAX_PIXELS = 600;

export const DEFAULT_LAID: LaidTip = { tip: 'round', size: 0.5, hardness: 1, roundness: 1, spacing: 0.1, scatter: 0, angleJitter: 0, follow: false };

const num = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** A laid tip read from saved data: null when there is none, and a whole one with anything odd put right. */
export function cleanLaid(raw: unknown): LaidTip | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const picture = r.tip === 'picture' ? readPixelStamp(r.picture) : null;
  const tip = r.tip === 'square' ? 'square' : r.tip === 'picture' && picture ? 'picture' : 'round';
  return {
    tip,
    ...(tip === 'picture' ? { picture } : {}),
    size: r3(num(r.size, LAID_SIZE.min, LAID_SIZE.max, DEFAULT_LAID.size)),
    hardness: r3(num(r.hardness, 0, 1, DEFAULT_LAID.hardness)),
    roundness: r3(num(r.roundness, 0.05, 1, DEFAULT_LAID.roundness)),
    spacing: r3(num(r.spacing, LAID_SPACING.min, LAID_SPACING.max, DEFAULT_LAID.spacing)),
    scatter: r3(num(r.scatter, LAID_SCATTER.min, LAID_SCATTER.max, DEFAULT_LAID.scatter)),
    angleJitter: r3(num(r.angleJitter, 0, 1, DEFAULT_LAID.angleJitter)),
    follow: r.follow === true,
  };
}

export function sameLaid(a: LaidTip | undefined, b: LaidTip | undefined): boolean {
  if (!a || !b) return !a === !b;
  const close = (x: number, y: number): boolean => Math.abs(x - y) < 1e-6;
  const pic = a.tip !== 'picture' || (!!a.picture && !!b.picture && (a.picture === b.picture || (a.picture.w === b.picture.w && a.picture.h === b.picture.h && a.picture.cells.length === b.picture.cells.length && a.picture.cells.every((c, i) => c === b.picture!.cells[i]))));
  return a.tip === b.tip && pic && close(a.size, b.size) && close(a.hardness, b.hardness) && close(a.roundness, b.roundness) && close(a.spacing, b.spacing) && close(a.scatter, b.scatter) && close(a.angleJitter, b.angleJitter) && a.follow === b.follow;
}
