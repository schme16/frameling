// What a saved pixel brush holds. The pixel side of the brush library keeps three kinds of brush: a pixel brush (the dab
// engine in this folder), a soft paint tool with its size, hardness and flow, and a dry medium (charcoal, chalk, pencil...)
// with its paper. Pure functions, no DOM, so the rules can be tested without drawing anything.
import { isMedium, type DryId } from '../dry/maths';
import { isPaper, type PaperKind } from '../dry/paper';
import { SIZE_RANGE as DRY_SIZE, PRESS_RANGE } from '../dry/settings';
import { FLOW_RANGE as SOFT_FLOW, SIZE_RANGE as SOFT_SIZE } from '../soft/settings';
import type { SoftKind } from '../soft/maths';
import { cleanDab, sameDab, type DabBrush } from './maths';

export const SOFT_KINDS: SoftKind[] = ['airbrush', 'soft-brush', 'soft-eraser', 'highlighter', 'smudge'];
const isSoft = (v: unknown): v is SoftKind => typeof v === 'string' && (SOFT_KINDS as string[]).includes(v);

export type PixelSpec =
  | { kind: 'dab'; dab: DabBrush }
  | { kind: 'soft'; tool: SoftKind; size: number; hardness: number; flow: number }
  | { kind: 'dry'; medium: DryId; paper: PaperKind; size: number; hardness: number; press: number };

const num = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
const r3 = (v: number): number => Math.round(v * 1000) / 1000;

/** A saved pixel brush read back. Null when it is none of the three kinds; anything off inside one takes a default. */
export function cleanSpec(raw: unknown): PixelSpec | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.kind === 'dab') return { kind: 'dab', dab: cleanDab(r.dab) };
  if (r.kind === 'soft') {
    if (!isSoft(r.tool)) return null;
    return { kind: 'soft', tool: r.tool, size: Math.round(num(r.size, SOFT_SIZE.min, SOFT_SIZE.max) ?? 16), hardness: r3(num(r.hardness, 0, 1) ?? 0.5), flow: r3(num(r.flow, SOFT_FLOW.min, SOFT_FLOW.max) ?? 1) };
  }
  if (r.kind === 'dry') {
    if (!isMedium(r.medium)) return null;
    return { kind: 'dry', medium: r.medium, paper: isPaper(r.paper) ? r.paper : 'medium', size: Math.round(num(r.size, DRY_SIZE.min, DRY_SIZE.max) ?? 20), hardness: r3(num(r.hardness, 0, 1) ?? 0.3), press: r3(num(r.press, PRESS_RANGE.min, PRESS_RANGE.max) ?? 0.7) };
  }
  return null;
}

/** True when two saved pixel brushes make the same marks. */
export function sameSpec(a: PixelSpec, b: PixelSpec): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) < 1e-6;
  if (a.kind === 'dab' && b.kind === 'dab') return sameDab(a.dab, b.dab);
  if (a.kind === 'soft' && b.kind === 'soft') return a.tool === b.tool && a.size === b.size && close(a.hardness, b.hardness) && close(a.flow, b.flow);
  if (a.kind === 'dry' && b.kind === 'dry') return a.medium === b.medium && a.paper === b.paper && a.size === b.size && close(a.hardness, b.hardness) && close(a.press, b.press);
  return false;
}

/** How wide the brush is, in pixels, whichever kind it is. */
export const specSize = (s: PixelSpec): number => (s.kind === 'dab' ? s.dab.size : s.size);

/** The same spec at another width. */
export function withSize(s: PixelSpec, size: number): PixelSpec {
  return s.kind === 'dab' ? { kind: 'dab', dab: cleanDab({ ...s.dab, size }, s.dab) } : { ...s, size: Math.round(size) };
}

/** Which tool a kind of pixel brush is drawn with. */
export const specTool = (s: PixelSpec): string => (s.kind === 'dab' ? 'pixel-brush' : s.kind === 'dry' ? 'charcoal' : s.tool);
