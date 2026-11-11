/**
 * Gradients in the colour boxes. Each box (fill and stroke) can hold a plain colour (the usual) or a gradient: a
 * linear or radial blend of two or more colours. The box keeps the colours and the direction; a shape drawn with it
 * gets the gradient laid across its own size, and the Gradient tool (F) moves its ends on the canvas afterwards.
 *
 * The box's plain colour (ui.fillColor / ui.color) always follows the gradient's first colour, so anything that only
 * understands one colour (the paint bucket on pixel layers, the eyedropper, old exports) still gets a sensible one.
 */
import { useSyncExternalStore } from 'react';
import type { Color, FillShape, Gradient, GradientStop, PathShape, Shape } from '../core/format';
import { colorAt, firstColor, placeGradient, sortedStops, type GradientStyle } from '../core/gradient';
import { store } from '../core/store';
import { pathsBounds } from '../geometry/hit';
import { activeDrawing, editActiveDrawing } from './edit';

export type Well = 'fill' | 'stroke';
export type PaintKind = 'solid' | 'linear' | 'radial';

interface State {
  fill: GradientStyle | null;
  stroke: GradientStyle | null;
  /** The stop the picker is changing, per box. */
  stop: { fill: number; stroke: number };
}

const KEY = 'frameling.gradientWells';
let state: State = { fill: null, stroke: null, stop: { fill: 0, stroke: 0 } };
const listeners = new Set<() => void>();

const validStyle = (v: unknown): GradientStyle | null => {
  if (!v || typeof v !== 'object') return null;
  const g = v as GradientStyle;
  if ((g.kind !== 'linear' && g.kind !== 'radial') || !Array.isArray(g.stops) || g.stops.length < 2) return null;
  if (!g.stops.every((s) => s && typeof s.at === 'number' && typeof s.color === 'string')) return null;
  return { kind: g.kind, stops: sortedStops(g.stops), angle: typeof g.angle === 'number' && Number.isFinite(g.angle) ? g.angle : 0 };
};

try {
  if (typeof localStorage !== 'undefined') {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved && typeof saved === 'object') state = { fill: validStyle(saved.fill), stroke: validStyle(saved.stroke), stop: { fill: 0, stroke: 0 } };
  }
} catch {
  // start plain
}

function set(next: State): void {
  state = next;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify({ fill: state.fill, stroke: state.stroke }));
  } catch {
    // not saved this time
  }
  for (const fn of listeners) fn();
}

export function getGradientWells(): Readonly<State> {
  return state;
}

export function useGradientWells<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => sel(state),
  );
}

/** The gradient in a box, or null when it holds a plain colour (or none). */
export function wellGradient(w: Well): GradientStyle | null {
  const ui = store().get().ui;
  if (w === 'fill' ? !ui.fillColor : !ui.strokeOn) return null;
  return state[w];
}

export function paintKind(w: Well): PaintKind {
  return wellGradient(w)?.kind ?? 'solid';
}

/** Keeps the box's plain colour on the gradient's first colour. */
function syncPlain(w: Well, g: GradientStyle | null): void {
  if (!g) return;
  const c = firstColor(g);
  if (w === 'fill') store().setUi({ fillColor: c });
  else store().setUi({ color: c, strokeOn: true });
}

/** A lighter version of a colour, for the second colour of a new gradient. */
function lighter(c: Color): Color {
  return colorAt(
    [
      { at: 0, color: c.slice(0, 7) },
      { at: 1, color: '#ffffff' },
    ],
    0.65,
  );
}

/** Switches a box between a plain colour and a linear or radial gradient. */
export function setPaintKind(w: Well, kind: PaintKind): void {
  const ui = store().get().ui;
  const plain = (w === 'fill' ? ui.fillColor : ui.strokeOn ? ui.color : null) ?? ui.color;
  if (kind === 'solid') {
    set({ ...state, [w]: null });
  } else {
    const cur = state[w];
    const g: GradientStyle = cur
      ? { ...cur, kind }
      : {
          kind,
          angle: 0,
          stops: kind === 'radial' ? [{ at: 0, color: lighter(plain) }, { at: 1, color: plain }] : [{ at: 0, color: plain }, { at: 1, color: lighter(plain) }],
        };
    set({ ...state, [w]: g, stop: { ...state.stop, [w]: Math.min(state.stop[w], g.stops.length - 1) } });
    syncPlain(w, g);
  }
  applyGradientToSelection(w);
}

function edit(w: Well, fn: (g: GradientStyle) => GradientStyle, stop?: number, place = false): void {
  const g = state[w];
  if (!g) return;
  const next = fn(g);
  set({ ...state, [w]: next, stop: { ...state.stop, [w]: Math.max(0, Math.min(stop ?? state.stop[w], next.stops.length - 1)) } });
  syncPlain(w, next);
  applyGradientToSelection(w, place);
}

export function selectStop(w: Well, i: number): void {
  set({ ...state, stop: { ...state.stop, [w]: i } });
}

/** The colour of the stop being edited. */
export function stopColor(w: Well): Color | null {
  const g = wellGradient(w);
  return g ? g.stops[Math.min(state.stop[w], g.stops.length - 1)].color : null;
}

export function setStopColor(w: Well, c: Color): void {
  edit(w, (g) => ({ ...g, stops: g.stops.map((s, i) => (i === state.stop[w] ? { ...s, color: c } : s)) }));
}

/** Adds a stop at `at` (0 to 1) in the colour the gradient already has there, and picks it. */
export function addStop(w: Well, at: number): void {
  const g = state[w];
  if (!g) return;
  const t = Math.max(0, Math.min(1, at));
  const stops = sortedStops([...g.stops, { at: t, color: colorAt(g.stops, t) }]);
  edit(w, (x) => ({ ...x, stops }), stops.findIndex((s) => s.at === t));
}

/** Moves a stop along the bar. Returns its new index (stops stay in order). */
export function moveStop(w: Well, i: number, at: number): number {
  const g = state[w];
  if (!g || !g.stops[i]) return i;
  const moved: GradientStop = { ...g.stops[i], at: Math.max(0, Math.min(1, at)) };
  const stops = g.stops.map((s, j) => (j === i ? moved : s));
  const sorted = sortedStops(stops);
  const ni = sorted.indexOf(sorted.find((s) => s.at === moved.at && s.color === moved.color)!);
  edit(w, (x) => ({ ...x, stops: sorted }), ni);
  return ni;
}

/** Takes a stop away. A gradient keeps at least two. */
export function removeStop(w: Well, i: number): void {
  const g = state[w];
  if (!g || g.stops.length <= 2) return;
  edit(w, (x) => ({ ...x, stops: x.stops.filter((_, j) => j !== i) }), Math.max(0, i - 1));
}

export function setAngle(w: Well, angle: number): void {
  edit(w, (g) => ({ ...g, angle: ((Math.round(angle) % 360) + 360) % 360 }), undefined, true);
}

/** Turns the colours round, end to end. */
export function reverseStops(w: Well): void {
  edit(w, (g) => ({ ...g, stops: sortedStops(g.stops.map((s) => ({ ...s, at: 1 - s.at }))) }));
}

/** Shift+X: the two boxes trade gradients (call before swapping the plain colours). */
export function swapGradientWells(): void {
  if (!state.fill && !state.stroke) return;
  set({ fill: state.stroke, stroke: state.fill, stop: { fill: state.stop.stroke, stroke: state.stop.fill } });
}

/** The gradient a new shape gets from a box, laid over these paths, or undefined when the box holds a plain colour. */
export function gradientFor(w: Well, paths: PathShape['paths']): Gradient | undefined {
  const g = wellGradient(w);
  if (!g) return undefined;
  const b = pathsBounds(paths);
  return b ? placeGradient(g, b) : undefined;
}

/** A newly drawn shape with the boxes' gradients on it (when they hold gradients). Used by the drawing tools. */
export function withWellGradients<S extends Shape>(s: S): S {
  if (s.type === 'path') {
    const out: PathShape = { ...s };
    if (s.fill) {
      const g = gradientFor('fill', s.paths);
      if (g) out.fillGradient = g;
    }
    if (s.stroke) {
      const g = gradientFor('stroke', s.paths);
      if (g) out.strokeGradient = g;
    }
    return out as S;
  }
  if (s.type === 'fill') {
    const g = gradientFor('fill', s.paths);
    return (g ? { ...s, gradient: g } : s) as S;
  }
  return s;
}

/**
 * The selected shapes take the box's gradient (or lose theirs, for a plain colour). A shape that already has a
 * gradient keeps where its ends are, so recolouring doesn't undo a direction set on the canvas.
 */
export function applyGradientToSelection(w: Well, place = false): void {
  const { ui } = store().get();
  if (!ui.selection.length) return;
  const d = activeDrawing();
  if (!d || d.kind !== 'vector') return;
  const ids = new Set(ui.selection);
  const targets = d.shapes.filter((s) => ids.has(s.id) && (s.type === 'fill' || s.type === 'path'));
  if (!targets.length) return;
  const style = wellGradient(w);
  const placed = (paths: FillShape['paths'], had: Gradient | undefined): Gradient | undefined => {
    if (!style) return undefined;
    if (had && had.kind === style.kind && !place) return { ...had, stops: sortedStops(style.stops) };
    const b = pathsBounds(paths);
    return b ? placeGradient(style, b) : undefined;
  };
  editActiveDrawing(
    style ? 'Change gradient' : w === 'fill' ? 'Change fill colour' : 'Change stroke colour',
    'vector',
    (dr) => {
      for (const s of dr.shapes) {
        if (!ids.has(s.id)) continue;
        if (s.type === 'fill' && w === 'fill') {
          const g = placed(s.paths, s.gradient);
          if (g) {
            s.gradient = g;
            s.color = firstColor(g);
          } else delete s.gradient;
        } else if (s.type === 'path') {
          if (w === 'fill') {
            const g = s.fill ? placed(s.paths, s.fillGradient) : undefined;
            if (g) s.fillGradient = g;
            else delete s.fillGradient;
          } else {
            const g = s.stroke ? placed(s.paths, s.strokeGradient) : undefined;
            if (g) s.strokeGradient = g;
            else delete s.strokeGradient;
          }
        }
      }
    },
    { coalesce: `gradient-${w}` },
  );
}

// A box set to none drops its gradient, so turning it back on starts from a plain colour.
store().subscribe(() => {
  const ui = store().get().ui;
  if (state.fill && !ui.fillColor) set({ ...state, fill: null });
  if (state.stroke && !ui.strokeOn) set({ ...state, stroke: null });
});
