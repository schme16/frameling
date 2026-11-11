/**
 * Gradients: building them for the canvas, placing a gradient style on a shape, moving them with a shape, and reading
 * them safely out of a file. Pure apart from `canvasGradient`, which only needs a 2D context.
 */
import type { Color, Gradient, GradientStop } from './format';

type P = { x: number; y: number };

/** What the colour boxes hold: the colours and the direction, but no position (that comes from the shape). */
export interface GradientStyle {
  kind: 'linear' | 'radial';
  stops: GradientStop[];
  /** Degrees, 0 = left to right, 90 = top to bottom. */
  angle: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function rgba(c: string): [number, number, number, number] {
  let t = c.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3,4}$/i.test(t)) t = [...t].map((x) => x + x).join('');
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(t)) return [0, 0, 0, 255];
  const n = (i: number) => parseInt(t.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), t.length === 8 ? n(6) : 255];
}

const h2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** Stops in order, each clamped to 0..1. At least one. */
export function sortedStops(stops: readonly GradientStop[]): GradientStop[] {
  const s = stops.map((x) => ({ at: clamp01(x.at), color: x.color })).sort((a, b) => a.at - b.at);
  return s.length ? s : [{ at: 0, color: '#000000' }];
}

/** The colour part way along a gradient's stops (t from 0 to 1). */
export function colorAt(stops: readonly GradientStop[], t: number): Color {
  const s = sortedStops(stops);
  if (t <= s[0].at) return s[0].color;
  const last = s[s.length - 1];
  if (t >= last.at) return last.color;
  for (let i = 1; i < s.length; i++) {
    if (t <= s[i].at) {
      const a = s[i - 1];
      const b = s[i];
      const k = b.at - a.at > 1e-9 ? (t - a.at) / (b.at - a.at) : 0;
      const ca = rgba(a.color);
      const cb = rgba(b.color);
      const m = ca.map((v, j) => v + (cb[j] - v) * k);
      return '#' + h2(m[0]) + h2(m[1]) + h2(m[2]) + (m[3] < 254.5 ? h2(m[3]) : '');
    }
  }
  return last.color;
}

/** The single colour that stands in for a gradient where only one fits (the first stop). */
export const firstColor = (g: Gradient | GradientStyle): Color => sortedStops(g.stops)[0].color;

/** A canvas gradient for a shape's gradient. */
export function canvasGradient(g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, gr: Gradient): CanvasGradient {
  const cg =
    gr.kind === 'radial'
      ? g.createRadialGradient(gr.from.x, gr.from.y, 0, gr.from.x, gr.from.y, Math.max(0.001, Math.hypot(gr.to.x - gr.from.x, gr.to.y - gr.from.y)))
      : g.createLinearGradient(gr.from.x, gr.from.y, gr.to.x, gr.to.y);
  for (const s of sortedStops(gr.stops)) {
    try {
      cg.addColorStop(s.at, s.color);
    } catch {
      // a colour the canvas can't read: leave that stop out
    }
  }
  return cg;
}

/**
 * Lays a gradient style over a box: linear runs edge to edge through the middle at the style's angle, radial
 * starts in the middle and reaches the furthest corner's side.
 */
export function placeGradient(style: GradientStyle, box: { x0: number; y0: number; x1: number; y1: number }): Gradient {
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const a = (style.angle * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const hw = (box.x1 - box.x0) / 2;
  const hh = (box.y1 - box.y0) / 2;
  const stops = sortedStops(style.stops);
  if (style.kind === 'radial') {
    const r = Math.max(hw, hh, 0.5);
    return { kind: 'radial', stops, from: { x: cx, y: cy }, to: { x: cx + dx * r, y: cy + dy * r } };
  }
  // Half the box's extent along the direction, so the first and last colours land exactly on the edges.
  const reach = Math.max(0.5, Math.abs(dx) * hw + Math.abs(dy) * hh);
  return { kind: 'linear', stops, from: { x: cx - dx * reach, y: cy - dy * reach }, to: { x: cx + dx * reach, y: cy + dy * reach } };
}

/** The style (no position) of a placed gradient. */
export function styleOf(g: Gradient): GradientStyle {
  return { kind: g.kind, stops: sortedStops(g.stops), angle: Math.round((Math.atan2(g.to.y - g.from.y, g.to.x - g.from.x) * 180) / Math.PI) };
}

/** The gradient with both ends moved by `f` (a shape being moved, scaled or turned). */
export function mapGradient(g: Gradient, f: (p: P) => P): Gradient {
  return { kind: g.kind, stops: g.stops.map((s) => ({ ...s })), from: f(g.from), to: f(g.to) };
}

/** Same colours, in a stable string, for telling apart two paints in merge drawing. */
export function gradientKey(g: Gradient | undefined): string {
  if (!g) return '';
  const r = (v: number) => Math.round(v * 10) / 10;
  return `${g.kind}:${g.stops.map((s) => `${s.at}=${s.color.toLowerCase()}`).join(',')}:${r(g.from.x)},${r(g.from.y)}>${r(g.to.x)},${r(g.to.y)}`;
}

/** A CSS background for showing a gradient style in the panel. */
export function gradientCss(style: Pick<GradientStyle, 'kind' | 'stops'>, angle = 0): string {
  const stops = sortedStops(style.stops)
    .map((s) => `${s.color} ${Math.round(s.at * 1000) / 10}%`)
    .join(', ');
  return style.kind === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${angle + 90}deg, ${stops})`;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPt = (v: unknown): v is P => !!v && typeof v === 'object' && isNum((v as P).x) && isNum((v as P).y);

/** A gradient read from a file, or undefined when it's missing or broken. */
export function readGradient(raw: unknown): Gradient | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (r.kind !== 'linear' && r.kind !== 'radial') return undefined;
  if (!isPt(r.from) || !isPt(r.to) || !Array.isArray(r.stops)) return undefined;
  const stops = r.stops.filter((s): s is GradientStop => !!s && typeof s === 'object' && isNum(s.at) && typeof s.color === 'string').map((s) => ({ at: clamp01(s.at), color: s.color }));
  if (!stops.length) return undefined;
  return { kind: r.kind, stops: sortedStops(stops), from: { x: r.from.x, y: r.from.y }, to: { x: r.to.x, y: r.to.y } };
}

/** Recolours a gradient's stops through `f`, or returns the same object when nothing changed. */
export function recolourGradient(g: Gradient, f: (c: Color) => Color): Gradient {
  let changed = false;
  const stops = g.stops.map((s) => {
    const c = f(s.color);
    if (c !== s.color) changed = true;
    return c === s.color ? s : { ...s, color: c };
  });
  return changed ? { ...g, stops } : g;
}

/** Two stops, light to dark of the same colour, as a first gradient to start from. */
export function starterStops(base: Color, other: Color = '#ffffff'): GradientStop[] {
  return [
    { at: 0, color: other },
    { at: 1, color: base },
  ];
}

/** A fill or path shape from a file with any broken gradient dropped (the plain colour then shows). */
export function cleanGradients<T extends Record<string, unknown>>(s: T): T {
  const keys = s.type === 'fill' ? ['gradient'] : s.type === 'path' ? ['fillGradient', 'strokeGradient'] : [];
  let out = s;
  for (const k of keys) {
    if (!(k in s)) continue;
    const g = readGradient(s[k]);
    if (out === s) out = { ...s };
    if (g) (out as Record<string, unknown>)[k] = g;
    else delete (out as Record<string, unknown>)[k];
  }
  return out;
}

/**
 * Part way between two gradients (a shape tween). Matching ones (same kind and number of stops) blend smoothly;
 * otherwise the nearer key's gradient is used. A missing one is a plain colour: `undefined` once past halfway.
 */
export function blendGradient(a: Gradient | undefined, b: Gradient | undefined, t: number): Gradient | undefined {
  if (!a || !b) return t < 0.5 ? a : b;
  const sa = sortedStops(a.stops);
  const sb = sortedStops(b.stops);
  if (a.kind !== b.kind || sa.length !== sb.length) return t < 0.5 ? a : b;
  const l = (x: number, y: number) => x + (y - x) * t;
  return {
    kind: a.kind,
    stops: sa.map((s, i) => ({ at: l(s.at, sb[i].at), color: colorAt([{ at: 0, color: s.color }, { at: 1, color: sb[i].color }], t) })),
    from: { x: l(a.from.x, b.from.x), y: l(a.from.y, b.from.y) },
    to: { x: l(a.to.x, b.to.x), y: l(a.to.y, b.to.y) },
  };
}
