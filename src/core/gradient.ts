/**
 * Gradients: building them for the canvas, placing a gradient style on a shape, moving them with a shape, and reading
 * them safely out of a file. Pure apart from `canvasGradient`, which only needs a 2D context.
 */
import type { Color, Gradient, GradientKind, GradientStop } from './format';

type P = { x: number; y: number };

/** What the colour boxes hold: the colours and the direction, but no position (that comes from the shape). */
export interface GradientStyle {
  kind: GradientKind;
  stops: GradientStop[];
  /** Degrees, 0 = left to right, 90 = top to bottom. For angular, the direction the sweep starts in. */
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

/** The direction an angular gradient starts in, in radians (0 = right, turning clockwise on screen). */
export const conicStart = (g: Pick<Gradient, 'from' | 'to'>): number => Math.atan2(g.to.y - g.from.y, g.to.x - g.from.x);

/**
 * How far round an angular gradient a point is, from 0 (the start direction) up to 1 (all the way round again),
 * turning clockwise on screen. The centre itself is 0.
 */
export function angularAt(g: Pick<Gradient, 'from' | 'to'>, x: number, y: number): number {
  const dx = x - g.from.x;
  const dy = y - g.from.y;
  if (dx === 0 && dy === 0) return 0;
  const turn = (Math.atan2(dy, dx) - conicStart(g)) / (Math.PI * 2);
  return ((turn % 1) + 1) % 1;
}

/**
 * An angular gradient cut into `steps` equal wedges, each one plain colour (the colour at its middle), for the formats
 * that have no conic gradient of their own. Angles are turns from the start direction, 0 to 1, clockwise.
 */
export function angularWedges(stops: readonly GradientStop[], steps = 90): { from: number; to: number; color: Color }[] {
  const n = Math.max(3, Math.round(steps));
  return Array.from({ length: n }, (_, i) => ({ from: i / n, to: (i + 1) / n, color: colorAt(stops, (i + 0.5) / n) }));
}

/**
 * Where a diamond gradient sits: its middle, the unit direction along `to` and across it, and how far out `to` is (never
 * 0, so a gradient dragged to nothing still has a size). The diamond is the square turned on its corner whose corner
 * is `to`: a point is at `(|along| + |across|) / reach` of the way out.
 */
export function diamondFrame(g: Pick<Gradient, 'from' | 'to'>): { cx: number; cy: number; ux: number; uy: number; vx: number; vy: number; reach: number } {
  const dx = g.to.x - g.from.x;
  const dy = g.to.y - g.from.y;
  const len = Math.hypot(dx, dy);
  const ux = len > 1e-9 ? dx / len : 1;
  const uy = len > 1e-9 ? dy / len : 0;
  return { cx: g.from.x, cy: g.from.y, ux, uy, vx: -uy, vy: ux, reach: Math.max(len, 0.001) };
}

/**
 * How far out a diamond gradient a point is: 0 in the middle, 1 on the diamond's outline, more outside it (the last
 * colour carries on there). The colour is `colorAt(stops, diamondAt(...))`, which clamps.
 */
export function diamondAt(g: Pick<Gradient, 'from' | 'to'>, x: number, y: number): number {
  const f = diamondFrame(g);
  const px = x - f.cx;
  const py = y - f.cy;
  return (Math.abs(px * f.ux + py * f.uy) + Math.abs(px * f.vx + py * f.vy)) / f.reach;
}

/** The four corners of a diamond gradient's outline (the one at `to` first, then clockwise on screen). */
export function diamondCorners(g: Pick<Gradient, 'from' | 'to'>): P[] {
  const f = diamondFrame(g);
  const at = (a: number, b: number): P => ({ x: f.cx + (f.ux * a + f.vx * b) * f.reach, y: f.cy + (f.uy * a + f.vy * b) * f.reach });
  return [at(1, 0), at(0, 1), at(-1, 0), at(0, -1)];
}

/** One quarter of a diamond: the straight gradient that runs across it, and the plain four sided piece it covers. */
export interface DiamondQuarter {
  from: P;
  to: P;
  poly: P[];
}

/**
 * A diamond gradient as four mirrored linear gradients, one in each quarter round the middle (|along| + |across| is a
 * plain straight gradient inside a quarter). Each quarter's piece reaches `size` out, which should be past everything
 * the gradient will be painted on, and starts `overlap` back over its neighbours' edges, so a seam never shows where
 * two pieces meet (leave it 0 when the colours are see-through, as the overlap would then paint twice).
 */
export function diamondQuarters(g: Pick<Gradient, 'from' | 'to'>, size: number, overlap = 0): DiamondQuarter[] {
  const f = diamondFrame(g);
  const out: DiamondQuarter[] = [];
  for (const [su, sv] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const at = (a: number, b: number): P => ({ x: f.cx + f.ux * a * su + f.vx * b * sv, y: f.cy + f.uy * a * su + f.vy * b * sv });
    // The stops sit between the middle and half way to the quarter's far corner, so the colour reaches its end on the outline.
    const half = f.reach / 2;
    out.push({ from: { x: f.cx, y: f.cy }, to: at(half, half), poly: [at(-overlap, -overlap), at(size, -overlap), at(size, size), at(-overlap, size)] });
  }
  return out;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Surface = OffscreenCanvas | HTMLCanvasElement;

// Two spare canvases, kept between draws: one for the diamond itself, one for a line's shape.
const spares: (Surface | null)[] = [null, null];

/** Lets go of the spare canvases (they are made again when a diamond is next drawn). */
export function dropSpareCanvases(): void {
  spares[0] = spares[1] = null;
}

/** A cleared spare canvas the size of `g`'s, with its context in the plain starting state. */
function spare(slot: 0 | 1, g: Ctx): Ctx {
  const w = g.canvas.width;
  const h = g.canvas.height;
  let cv = spares[slot];
  if (!cv) cv = spares[slot] = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  if (cv.width !== w) cv.width = w;
  if (cv.height !== h) cv.height = h;
  const c = cv.getContext('2d') as Ctx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, w, h);
  return c;
}

/**
 * Paints a whole diamond gradient on a cleared canvas, as its four quarters seen through `m` (the drawing's transform).
 * Each quarter after the first replaces what is under it ("copy", inside its own clip) and starts a pixel back over its
 * neighbour, so where two quarters meet there is one colour and never a seam, even when the colours are see-through.
 */
function paintQuarters(c: Ctx, gr: Gradient, m: DOMMatrix): void {
  const scale = Math.hypot(m.a, m.b) || 1;
  const stops = sortedStops(gr.stops);
  c.save();
  c.setTransform(m);
  diamondQuarters(gr, 1e5, 1 / scale).forEach((q, i) => {
    const cg = c.createLinearGradient(q.from.x, q.from.y, q.to.x, q.to.y);
    for (const s of stops) {
      try {
        cg.addColorStop(s.at, s.color);
      } catch {
        // a colour the canvas can't read: leave that stop out
      }
    }
    c.fillStyle = cg;
    c.beginPath();
    q.poly.forEach((p, k) => (k ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.closePath();
    if (i === 0) c.fill();
    else {
      c.save();
      c.clip();
      c.globalCompositeOperation = 'copy';
      c.fillRect(-1e6, -1e6, 2e6, 2e6);
      c.restore();
    }
  });
  c.restore();
}

/**
 * Fills a shape's path with a diamond gradient. A canvas has no diamond gradient, so the diamond is painted whole on a
 * spare canvas (four straight gradients, one in each quarter) and laid on through the shape's outline.
 */
export function fillDiamond(g: Ctx, gr: Gradient, path: Path2D, rule: CanvasFillRule = 'nonzero'): void {
  const a = spare(0, g);
  paintQuarters(a, gr, g.getTransform());
  g.save();
  g.clip(path, rule);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(a.canvas as CanvasImageSource, 0, 0);
  g.restore();
}

/**
 * Strokes a line with a diamond gradient. `draw` strokes the line (width, joins, dashes and all) on the context it is
 * given, in any colour, on a spare canvas; the diamond is painted on another and kept only where the line is, then laid
 * on. A canvas can only clip to a fill, so this is how a line takes a gradient that is not one piece.
 */
export function strokeDiamond(g: Ctx, gr: Gradient, draw: (c: Ctx) => void): void {
  const m = g.getTransform();
  const line = spare(1, g);
  line.save();
  line.setTransform(m);
  draw(line);
  line.restore();
  const a = spare(0, g);
  paintQuarters(a, gr, m);
  line.globalCompositeOperation = 'source-in';
  line.drawImage(a.canvas as CanvasImageSource, 0, 0);
  line.globalCompositeOperation = 'source-over';
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(line.canvas as CanvasImageSource, 0, 0);
  g.restore();
}

/** A canvas gradient for a shape's gradient. A diamond has no single canvas gradient (see `fillDiamond`), so it comes out as the straight one along its line. */
export function canvasGradient(g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, gr: Gradient): CanvasGradient {
  const conic = gr.kind === 'angular' ? (g as { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient }).createConicGradient : undefined;
  const cg =
    gr.kind === 'angular' && conic
      ? conic.call(g, conicStart(gr), gr.from.x, gr.from.y)
      : gr.kind === 'radial'
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
 * starts in the middle and reaches the furthest corner's side, and a diamond does the same with its corner there.
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
  if (style.kind === 'radial' || style.kind === 'angular' || style.kind === 'diamond') {
    const r = Math.max(hw, hh, 0.5);
    return { kind: style.kind, stops, from: { x: cx, y: cy }, to: { x: cx + dx * r, y: cy + dy * r } };
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
  // CSS starts a conic sweep at the top and the canvas at the right, so the sweep turns a quarter to line up.
  if (style.kind === 'angular') return `conic-gradient(from ${angle + 90}deg, ${stops})`;
  // CSS has no diamond: four straight gradients, one per quarter of the box, each running from the middle out to its far corner.
  if (style.kind === 'diamond') {
    const half = sortedStops(style.stops)
      .map((s) => `${s.color} ${Math.round(s.at * 500) / 10}%`)
      .join(', ');
    const q = (to: string, pos: string) => `linear-gradient(${to}, ${half}) ${pos} / 50% 50% no-repeat`;
    return [q('to top left', 'left top'), q('to top right', 'right top'), q('to bottom right', 'right bottom'), q('to bottom left', 'left bottom')].join(', ');
  }
  return style.kind === 'radial' ? `radial-gradient(circle, ${stops})` : `linear-gradient(${angle + 90}deg, ${stops})`;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPt = (v: unknown): v is P => !!v && typeof v === 'object' && isNum((v as P).x) && isNum((v as P).y);

/** A gradient read from a file, or undefined when it's missing or broken. */
export function readGradient(raw: unknown): Gradient | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (r.kind !== 'linear' && r.kind !== 'radial' && r.kind !== 'angular' && r.kind !== 'diamond') return undefined;
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

/** What a set of shapes holds for one side (fill or stroke): nothing to edit, plain colours, one shared gradient, or a mix. */
export type SharedPaint = { state: 'none' } | { state: 'plain' } | { state: 'same'; style: GradientStyle } | { state: 'differ'; count: number };

/** The colours and kind of a gradient, in a stable string. Where the ends sit is left out: it belongs to each shape. */
export function stopsKey(g: Pick<Gradient, 'kind' | 'stops'>): string {
  return `${g.kind}:${sortedStops(g.stops).map((s) => `${Math.round(s.at * 1000) / 1000}=${s.color.toLowerCase()}`).join(',')}`;
}

/**
 * What one side of the selected shapes holds. `list` has one entry per shape that can have that paint (a gradient or
 * undefined for a plain colour). Shapes with the same colours count as one gradient, wherever their ends sit.
 */
export function sharedPaint(list: readonly (Gradient | undefined)[]): SharedPaint {
  if (!list.length) return { state: 'none' };
  const first = list.find((g) => g);
  if (!first) return { state: 'plain' };
  const key = stopsKey(first);
  if (list.every((g) => g && stopsKey(g) === key)) return { state: 'same', style: styleOf(first) };
  return { state: 'differ', count: list.length };
}

/** What a set of shapes holds for one side when it is a plain colour: nothing, one shared colour, or a mix. */
export type SharedColour = { state: 'none' } | { state: 'same'; color: Color } | { state: 'differ'; count: number };

/** The plain colour a set of shapes share (the same colour in any letter case counts as the same). One entry per shape. */
export function sharedColour(list: readonly Color[]): SharedColour {
  if (!list.length) return { state: 'none' };
  const key = list[0].toLowerCase();
  if (list.every((c) => c.toLowerCase() === key)) return { state: 'same', color: list[0] };
  return { state: 'differ', count: list.length };
}
