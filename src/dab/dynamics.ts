/**
 * Brush dynamics: what the pen, the hand and the stroke itself do to each dab. This is the one place the pixel brush
 * says "this input drives that setting", so the brush files from other programs (Photoshop's Control menus, Krita's
 * sensors, Procreate's pressure curves) all have somewhere to land: each of them becomes a list of routes.
 *
 * A route says: take this source (0 to 1), push this target by this amount. Sources are what is being sensed right now,
 * targets are the dab's own settings. Pure functions, no DOM, so every law here is tested on its own.
 */

import { cleanCurve, sameCurve, shape, type Curve } from './curve';

export type DynSource = 'pressure' | 'tilt' | 'twist' | 'speed' | 'direction' | 'fade' | 'random';
export type DynTarget = 'size' | 'flow' | 'opacity' | 'angle' | 'scatter' | 'mix' | 'hue' | 'saturation' | 'lightness';

export const DYN_SOURCES: DynSource[] = ['pressure', 'tilt', 'twist', 'speed', 'direction', 'fade', 'random'];
export const DYN_TARGETS: DynTarget[] = ['size', 'flow', 'opacity', 'angle', 'scatter', 'mix', 'hue', 'saturation', 'lightness'];

/** One input driving one setting. `amount` is how much of the range it uses (0 to 1); `invert` flips the source. */
export interface DynRoute {
  from: DynSource;
  to: DynTarget;
  amount: number;
  invert: boolean;
  /** How the source turns into what the route feels, before it is flipped: a bent line instead of a straight one (see curve.ts). Left out: straight. */
  curve?: Curve;
}

/** More routes than this in a brush are dropped when it is read: no real brush needs more, and a file is not trusted. */
export const MAX_ROUTES = 16;
/** How long a stroke takes to fade out, in pixels of line, when the brush does not say. */
export const FADE_DEFAULT = 150;
export const FADE_RANGE = { min: 10, max: 2000 };

export const isSource = (v: unknown): v is DynSource => typeof v === 'string' && (DYN_SOURCES as string[]).includes(v);
export const isTarget = (v: unknown): v is DynTarget => typeof v === 'string' && (DYN_TARGETS as string[]).includes(v);

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Routes read from saved or shared data: only well-formed ones, with the amount held to 0 to 1, and no more than MAX_ROUTES. */
export function cleanRoutes(raw: unknown): DynRoute[] {
  if (!Array.isArray(raw)) return [];
  const out: DynRoute[] = [];
  for (const r of raw) {
    if (out.length >= MAX_ROUTES) break;
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    if (!isSource(o.from) || !isTarget(o.to)) continue;
    const amount = typeof o.amount === 'number' && Number.isFinite(o.amount) ? clamp01(o.amount) : 1;
    const route: DynRoute = { from: o.from, to: o.to, amount: round3(amount), invert: o.invert === true };
    const curve = cleanCurve(o.curve);
    if (curve) route.curve = curve;
    out.push(route);
  }
  return out;
}

export const sameRoutes = (a: readonly DynRoute[], b: readonly DynRoute[]): boolean =>
  a.length === b.length && a.every((r, i) => r.from === b[i].from && r.to === b[i].to && r.invert === b[i].invert && Math.abs(r.amount - b[i].amount) < 1e-6 && sameCurve(r.curve, b[i].curve));

/** What a dab can feel right now. A source the device cannot give (a mouse has no tilt) is left undefined, and its routes sit out. */
export interface Inputs {
  pressure?: number;
  tilt?: number;
  twist?: number;
  speed?: number;
  /** Which way the line is heading, in radians. */
  heading?: number;
  /** How far along the stroke this dab is, in pixels of line. */
  travelled?: number;
  /** A fresh 0 to 1 number, asked for only when a route wants one (so the other brushes spend no random numbers). */
  random?: () => number;
}

/** The pushes the routes add up to. Size and flow multiply the dab's own; the others add to it. */
export interface Effects {
  size: number;
  flow: number;
  /** The most paint this dab may leave on a pixel, as a share of the brush's opacity. */
  opacity: number;
  /** Radians added to the dab's angle. */
  angle: number;
  /** Added to the scatter, as a share of the size. */
  scatter: number;
  /** 0 to 1: how far toward the back colour the paint goes. */
  mix: number;
  /** Degrees of hue turned (negative or positive). */
  hue: number;
  /** Added to saturation, -1 to 1. */
  sat: number;
  /** Added to lightness, -0.5 to 0.5. */
  light: number;
}

export const newEffects = (): Effects => ({ size: 1, flow: 1, opacity: 1, angle: 0, scatter: 0, mix: 0, hue: 0, sat: 0, light: 0 });
/** No push at all. Shared and never written to. */
export const NEUTRAL: Readonly<Effects> = Object.freeze(newEffects());

/** True when a route list changes anything about the colour (so the stroke knows whether to work colours out per dab). */
export const touchesColour = (routes: readonly DynRoute[]): boolean => routes.some((r) => r.to === 'mix' || r.to === 'hue' || r.to === 'saturation' || r.to === 'lightness');

/** Whether any route sends one of these sources to this target (the pen page then leaves that one to the brush). */
export const drivesFrom = (routes: readonly DynRoute[], to: DynTarget, from: DynSource[]): boolean => routes.some((r) => r.to === to && from.includes(r.from));

/** How fast the hand is moving as 0 to 1 (0 still, towards 1 flying). `pxPerMs` is art pixels per millisecond. */
export const SPEED_REF = 1.5;
export const speedValue = (pxPerMs: number): number => (pxPerMs <= 0 ? 0 : 1 - Math.exp(-pxPerMs / SPEED_REF));

/** How much of a fade is left after `travelled` pixels of line: 1 at the start, 0 once the length is gone. */
export const fadeValue = (travelled: number, length: number): number => clamp01(1 - travelled / Math.max(1, length));

/** The heading as 0 to 1 round the compass (0 is right, a quarter is down the screen). */
export const headingValue = (radians: number): number => (((radians / (Math.PI * 2)) % 1) + 1) % 1;

/** One source's value for these inputs, 0 to 1, or null when the device cannot give it. */
export function sourceValue(s: DynSource, i: Inputs, fade: number): number | null {
  switch (s) {
    case 'pressure':
      return i.pressure === undefined ? null : clamp01(i.pressure);
    case 'tilt':
      return i.tilt === undefined ? null : clamp01(i.tilt);
    case 'twist':
      return i.twist === undefined ? null : clamp01(i.twist / 360);
    case 'speed':
      return i.speed === undefined ? null : clamp01(i.speed);
    case 'direction':
      return i.heading === undefined ? null : headingValue(i.heading);
    case 'fade':
      return fadeValue(i.travelled ?? 0, fade);
    case 'random':
      return i.random ? i.random() : 0.5;
  }
}

/**
 * What all the routes do together at one dab, written into `out` (made fresh when left out). Size, flow and opacity multiply: a
 * route at amount 1 shrinks the dab to nothing where its source is 0 and leaves it alone where it is 1, and at amount 0.6
 * it never goes under 40% (Photoshop's "minimum diameter" is one minus this). Angle turns up to a full turn; scatter adds up
 * to a whole size; the colour ones swing both ways round the middle of the source.
 */
export function effectsOf(routes: readonly DynRoute[], i: Inputs, fade: number, out: Effects = newEffects()): Effects {
  out.size = 1;
  out.flow = 1;
  out.opacity = 1;
  out.angle = 0;
  out.scatter = 0;
  out.mix = 0;
  out.hue = 0;
  out.sat = 0;
  out.light = 0;
  for (const r of routes) {
    let v = sourceValue(r.from, i, fade);
    if (v === null) continue;
    if (r.curve) v = shape(r.curve, v);
    if (r.invert) v = 1 - v;
    const a = r.amount;
    switch (r.to) {
      case 'size':
        out.size *= 1 - a * (1 - v);
        break;
      case 'flow':
        out.flow *= 1 - a * (1 - v);
        break;
      case 'opacity':
        out.opacity *= 1 - a * (1 - v);
        break;
      case 'angle':
        out.angle += a * v * Math.PI * 2;
        break;
      case 'scatter':
        out.scatter += a * v;
        break;
      case 'mix':
        out.mix = clamp01(out.mix + a * v);
        break;
      case 'hue':
        out.hue += a * (2 * v - 1) * 180;
        break;
      case 'saturation':
        out.sat += a * (2 * v - 1);
        break;
      case 'lightness':
        out.light += a * (2 * v - 1) * 0.5;
        break;
    }
  }
  return out;
}

/** Two senses of the same pen, blended `k` of the way from `a` to `b` (a source one of them lacks stays missing). */
export function lerpInputs(a: Inputs, b: Inputs, k: number, into: Inputs): Inputs {
  const mix = (x: number | undefined, y: number | undefined): number | undefined => (x === undefined || y === undefined ? y : x + (y - x) * k);
  into.pressure = mix(a.pressure, b.pressure);
  into.tilt = mix(a.tilt, b.tilt);
  into.twist = mix(a.twist, b.twist);
  into.speed = mix(a.speed, b.speed);
  return into;
}

/** The amount a route starts at when a source is first picked for a setting: enough to see, not enough to surprise. */
export const START_AMOUNT: Record<DynTarget, number> = { size: 0.7, flow: 0.7, opacity: 0.7, angle: 0.25, scatter: 0.5, mix: 1, hue: 0.15, saturation: 0.3, lightness: 0.25 };

/** The first route that drives a setting (the one the options show), or null. A brush read from a file can hold more. */
export const routeFor = (routes: readonly DynRoute[], to: DynTarget): DynRoute | null => routes.find((r) => r.to === to) ?? null;

/**
 * The routes with the first one for a setting changed. `null` takes it away; a patch changes it, or makes it (from the
 * source in the patch, at the usual starting amount) when there is none yet. Any further routes for the same setting stay.
 */
export function withRoute(routes: readonly DynRoute[], to: DynTarget, patch: Partial<Omit<DynRoute, 'to'>> | null): DynRoute[] {
  const at = routes.findIndex((r) => r.to === to);
  if (patch === null) return at < 0 ? [...routes] : routes.filter((_, i) => i !== at);
  if (at < 0) {
    if (!patch.from) return [...routes];
    return cleanRoutes([...routes, { from: patch.from, to, amount: patch.amount ?? START_AMOUNT[to], invert: patch.invert ?? false }]);
  }
  return cleanRoutes(routes.map((r, i) => (i === at ? { ...r, ...patch } : r)));
}
