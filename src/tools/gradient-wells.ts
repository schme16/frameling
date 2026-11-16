/**
 * Gradients in the colour boxes. Each box (fill and stroke) can hold a plain colour (the usual) or a gradient: a
 * linear or radial blend of two or more colours. The box keeps the colours and the direction; a shape drawn with it
 * gets the gradient laid across its own size, and the Gradient tool (F) moves its ends on the canvas afterwards.
 *
 * The box's plain colour (ui.fillColor / ui.color) always follows the gradient's first colour, so anything that only
 * understands one colour (the paint bucket on pixel layers, the eyedropper, old exports) still gets a sensible one.
 *
 * Selected shapes come first: when the shapes you have picked all hold the same gradient for the box in front, the
 * panel shows that gradient and editing it changes the shapes. Picking a shape never touches the box; an edit does,
 * the box following the gradient you last worked on (the same as a plain colour: recolour a picked shape and the box
 * takes that colour too). Picked shapes with different gradients show "these differ", with a way to make them match.
 * With no gradient on the selection the panel edits the box and pushes it onto the selection, as it always did.
 */
import { useSyncExternalStore } from 'react';
import type { Color, FillShape, Gradient, GradientKind, GradientStop, PathShape, Shape, StrokeShape, TextShape } from '../core/format';
import { colorAt, firstColor, placeGradient, sharedColour, sharedPaint, sortedStops, styleOf, type GradientStyle, type SharedPaint } from '../core/gradient';
import { store, useStore } from '../core/store';
import { pathsBounds } from '../geometry/hit';
import { activeDrawing, editActiveDrawing } from './edit';
import { paintWellsOn } from './pixelWells';

export type Well = 'fill' | 'stroke';
export type PaintKind = 'solid' | GradientKind;

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
  if ((g.kind !== 'linear' && g.kind !== 'radial' && g.kind !== 'angular' && g.kind !== 'diamond') || !Array.isArray(g.stops) || g.stops.length < 2) return null;
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

type Painted = FillShape | PathShape;

/** The selected shapes that can hold a paint on this side (a plain fill or outline counts: it just has no gradient). */
function paintTargets(w: Well): Painted[] {
  const { ui } = store().get();
  if (!ui.selection.length) return [];
  const d = activeDrawing();
  if (!d || d.kind !== 'vector') return [];
  const ids = new Set(ui.selection);
  return d.shapes.filter((s): s is Painted => {
    if (!ids.has(s.id)) return false;
    if (s.type === 'fill') return w === 'fill';
    return s.type === 'path' && (w === 'fill' ? !!s.fill : !!s.stroke);
  });
}

const gradientOn = (s: Painted, w: Well): Gradient | undefined => (s.type === 'fill' ? s.gradient : w === 'fill' ? s.fillGradient : s.strokeGradient);

/** What the selection holds on one side. */
export function selectionPaint(w: Well): SharedPaint {
  return sharedPaint(paintTargets(w).map((s) => gradientOn(s, w)));
}

type Coloured = Painted | StrokeShape | TextShape;

/** The plain colour a shape holds on one side, or null when it holds none there (or is not that kind of shape). */
function colourOf(s: Shape, w: Well): Color | null {
  if (w === 'fill') {
    if (s.type === 'path') return s.fill;
    return s.type === 'fill' || s.type === 'text' ? s.color : null;
  }
  if (s.type === 'path') return s.stroke ? s.stroke.color : null;
  return s.type === 'stroke' ? s.color : null;
}

/** The selected shapes that hold a plain colour on this side (a gradient shape counts by its first colour). */
function colourTargets(w: Well): Coloured[] {
  const { ui } = store().get();
  if (!ui.selection.length || paintWellsOn()) return [];
  const d = activeDrawing();
  if (!d || d.kind !== 'vector') return [];
  const ids = new Set(ui.selection);
  return d.shapes.filter((s): s is Coloured => ids.has(s.id) && colourOf(s, w) !== null);
}

/**
 * Picked paths that hold nothing on this side (a line with no fill, a shape with no outline). A shape that cannot hold
 * the side at all (text has no outline) is not counted: it has no gap there, it just is not that kind of thing.
 */
function bareTargets(w: Well): PathShape[] {
  const { ui } = store().get();
  if (!ui.selection.length || paintWellsOn()) return [];
  const d = activeDrawing();
  if (!d || d.kind !== 'vector') return [];
  const ids = new Set(ui.selection);
  return d.shapes.filter((s): s is PathShape => s.type === 'path' && ids.has(s.id) && (w === 'fill' ? !s.fill : !s.stroke));
}

/**
 * Which paint the panel is showing for a box: the selection's gradient or colour, a mix, nothing at all, or the box's
 * own. `bare` is how many picked shapes have nothing on this side while others do: that is a mix too, the same as
 * different colours, so the box reads as mixed (the painted ones can still be edited, the bare ones stay as they are).
 */
export type PaintView =
  | { from: 'box'; style: GradientStyle | null }
  | { from: 'selection'; style: GradientStyle; bare?: number }
  | { from: 'colour'; color: Color; bare?: number }
  | { from: 'differ'; count: number; bare?: number }
  | { from: 'colours'; count: number; bare?: number }
  | { from: 'none'; count: number };

const views = new Map<Well, { key: string; view: PaintView }>();

export function paintView(w: Well): PaintView {
  const shared = selectionPaint(w);
  const box = wellGradient(w);
  // A plain colour only matters when no picked shape holds a gradient on this side.
  const col = shared.state === 'same' || shared.state === 'differ' ? null : sharedColour(colourTargets(w).map((s) => colourOf(s, w)!));
  const bare = bareTargets(w).length;
  const key = JSON.stringify([shared, box, col, bare]);
  const had = views.get(w);
  if (had && had.key === key) return had.view;
  const b = bare ? { bare } : {};
  const view: PaintView =
    shared.state === 'same'
      ? { from: 'selection', style: shared.style, ...b }
      : shared.state === 'differ'
        ? { from: 'differ', count: shared.count, ...b }
        : col?.state === 'same'
          ? { from: 'colour', color: col.color, ...b }
          : col?.state === 'differ'
            ? { from: 'colours', count: col.count, ...b }
            : bare
              ? { from: 'none', count: bare }
              : { from: 'box', style: box };
  views.set(w, { key, view });
  return view;
}

/** True when the box should read as a mix: different paints, or some shapes with paint and some with none. */
export function isMixed(v: PaintView): boolean {
  return v.from === 'differ' || v.from === 'colours' || (v.from !== 'none' && v.from !== 'box' && !!v.bare);
}

/**
 * Whether the colour picker is worth showing for this box: not when the picked shapes differ, where there is nothing to
 * show but a mix. A side with nothing on it still gets it, because picking a colour there is how you give it one.
 */
export function showsPicker(v: PaintView): boolean {
  return v.from !== 'differ' && v.from !== 'colours';
}

/** Whether Solid, Linear and Radial are offered. Always: picking one on a bare side is how you give it that kind. */
export function showsPaintKind(_v: PaintView): boolean {
  return true;
}

/** What a well's box shows: a colour, a gradient, "mixed", or nothing at all. Nothing means the see-through box. */
export function wellShows(v: PaintView, boxColor: string | null): 'mixed' | string | null {
  if (isMixed(v)) return 'mixed';
  if (v.from === 'none') return null;
  if (v.from === 'colour') return v.color;
  if (v.from === 'selection') return firstColor(v.style);
  return boxColor;
}

/** Whether a well has nothing on it, so its box is see-through and the box behind is cut away under it. */
export function wellIsNone(v: PaintView, boxColor: string | null): boolean {
  return !wellShows(v, boxColor);
}

/** Plain words about shapes with nothing on a side, for the panel. Null when there is nothing to say. */
export function bareWords(v: PaintView, w: Well): string | null {
  const noun = w === 'fill' ? 'fill' : 'outline';
  if (v.from === 'none') return v.count === 1 ? `The picked shape has no ${noun}. Click a colour to give it one.` : `None of the ${v.count} picked shapes have a ${noun}. Click a colour to give them one.`;
  if (v.from === 'box' || !v.bare) return null;
  return v.bare === 1 ? `1 of the picked shapes has no ${noun}, so it stays as it is.` : `${v.bare} of the picked shapes have no ${noun}, so they stay as they are.`;
}

/** The gradient being edited for a box, or null for a plain colour (or a mix, which has no one gradient). */
function shownStyle(w: Well): GradientStyle | null {
  const v = paintView(w);
  return 'style' in v ? v.style : null;
}

/** Re-reads when the shapes, the selection or the boxes change. */
export function usePaintView(w: Well): PaintView {
  useGradientWells((s) => s[w]);
  return useStore(() => paintView(w));
}

/**
 * Gives the picked shapes this plain colour on one side, and the box too (the box follows an edit, never a pick). Only
 * the shapes that hold a colour there change. The box stops being a gradient, as the shapes have stopped being one.
 */
export function writeColour(w: Well, c: Color): void {
  const targets = colourTargets(w);
  if (!targets.length) return;
  if (state[w]) set({ ...state, [w]: null });
  if (w === 'fill') store().setUi({ fillColor: c });
  else store().setUi({ color: c, strokeOn: true });
  const low = c.toLowerCase();
  if (targets.every((s) => colourOf(s, w)!.toLowerCase() === low)) return;
  const ids = new Set(targets.map((s) => s.id));
  editActiveDrawing(
    w === 'fill' ? 'Change fill colour' : 'Change stroke colour',
    'vector',
    (dr) => {
      for (const s of dr.shapes) {
        if (!ids.has(s.id)) continue;
        if (s.type === 'path') {
          if (w === 'fill') s.fill = c;
          else if (s.stroke) s.stroke.color = c;
        } else if (s.type === 'fill' || s.type === 'text' || s.type === 'stroke') s.color = c;
      }
    },
    { coalesce: `recolour-${w}-${gesture}` },
  );
}

/**
 * Picked shapes with nothing on this side take this colour there (a stroke-only line gets a fill), and the box follows
 * the edit. `bareTargets` is only the shapes that lack the side, so a shape that has it is never touched here.
 */
export function giveBare(w: Well, c: Color, coalesce = `recolour-${w}-${gesture}`): void {
  const targets = bareTargets(w);
  if (state[w]) set({ ...state, [w]: null });
  if (w === 'fill') store().setUi({ fillColor: c });
  else store().setUi({ color: c, strokeOn: true });
  if (!targets.length) return;
  const ids = new Set(targets.map((s) => s.id));
  editActiveDrawing(
    w === 'fill' ? 'Change fill colour' : 'Change stroke colour',
    'vector',
    (dr) => {
      for (const s of dr.shapes) {
        if (!ids.has(s.id) || s.type !== 'path') continue;
        if (w === 'fill') s.fill = c;
        else s.stroke = { color: c, width: 2, join: 'round', cap: 'round' };
      }
    },
    { coalesce },
  );
}

/** Picked shapes with different plain colours: give every one of them the first one's colour. */
export function matchSelectedColours(w: Well): void {
  const first = colourTargets(w)[0];
  if (first) writeColour(w, colourOf(first, w)!);
}

// One undo step per gesture: a drag, a run of picker moves, a key press. Each ends with endGradientGesture().
let gesture = 0;
export function endGradientGesture(): void {
  gesture++;
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

/** A new two-colour gradient that starts from one plain colour. */
function newStyle(kind: GradientKind, plain: Color): GradientStyle {
  // An angular one comes back to its first colour, so the sweep has no seam where it starts and ends.
  const stops = kind === 'angular' ? [{ at: 0, color: plain }, { at: 0.5, color: lighter(plain) }, { at: 1, color: plain }] : kind === 'radial' || kind === 'diamond' ? [{ at: 0, color: lighter(plain) }, { at: 1, color: plain }] : [{ at: 0, color: plain }, { at: 1, color: lighter(plain) }];
  return { kind, angle: 0, stops };
}

/** Switches a box between a plain colour and a linear or radial gradient. */
export function setPaintKind(w: Well, kind: PaintKind): void {
  let v = paintView(w);
  if (v.from === 'none') {
    // Nothing there to blend: Solid is what it is, and a gradient starts by giving the shapes the box's colour.
    if (kind === 'solid') return;
    const ui = store().get().ui;
    giveBare(w, (w === 'fill' ? ui.fillColor : ui.strokeOn ? ui.color : null) ?? ui.color, `gradient-${w}-${gesture}`);
    v = paintView(w);
  }
  if (v.from === 'colour' || v.from === 'colours') {
    // Plain colours on the picked shapes: Solid is what they already are, a gradient starts from the first colour.
    if (kind === 'solid') return;
    const first = colourTargets(w)[0];
    const plain = v.from === 'colour' ? v.color : colourOf(first, w)!;
    adopt(w, newStyle(kind, plain), 0, true);
    return;
  }
  if (v.from !== 'box') {
    // The picked shapes' own gradient changes, and the box takes it up too.
    const base = v.from === 'selection' ? v.style : firstSelectedStyle(w);
    if (kind === 'solid') {
      set({ ...state, [w]: null });
      writeSelection(w, () => null, false);
    } else if (base) adopt(w, { ...base, kind }, state.stop[w], v.from === 'differ');
    return;
  }
  const ui = store().get().ui;
  const plain = (w === 'fill' ? ui.fillColor : ui.strokeOn ? ui.color : null) ?? ui.color;
  if (kind === 'solid') {
    set({ ...state, [w]: null });
  } else {
    const cur = state[w];
    const g: GradientStyle = cur ? { ...cur, kind } : newStyle(kind, plain);
    set({ ...state, [w]: g, stop: { ...state.stop, [w]: Math.min(state.stop[w], g.stops.length - 1) } });
    syncPlain(w, g);
  }
  applyGradientToSelection(w);
}

function edit(w: Well, fn: (g: GradientStyle) => GradientStyle, stop?: number, place = false): void {
  const v = paintView(w);
  if (v.from !== 'selection' && v.from !== 'box') return;
  if (v.from === 'selection') {
    adopt(w, fn(v.style), stop, place);
    return;
  }
  const g = state[w];
  if (!g) return;
  const next = fn(g);
  set({ ...state, [w]: next, stop: { ...state.stop, [w]: Math.max(0, Math.min(stop ?? state.stop[w], next.stops.length - 1)) } });
  syncPlain(w, next);
  applyGradientToSelection(w, place);
}

/** Gives the picked shapes this gradient and makes it the box's too, so the next shape drawn gets what you are looking at. */
function adopt(w: Well, next: GradientStyle, stop: number | undefined, place: boolean): void {
  set({ ...state, [w]: next, stop: { ...state.stop, [w]: Math.max(0, Math.min(stop ?? state.stop[w], next.stops.length - 1)) } });
  syncPlain(w, next);
  writeSelection(w, () => next, place);
}

/** The first selected shape's gradient on this side, as a style. */
function firstSelectedStyle(w: Well): GradientStyle | null {
  for (const s of paintTargets(w)) {
    const g = gradientOn(s, w);
    if (g) return styleOf(g);
  }
  return null;
}

/** Selected shapes with different gradients: give every one of them the first one's colours and direction. */
export function matchSelectedGradients(w: Well): void {
  const base = firstSelectedStyle(w);
  if (base) adopt(w, base, 0, true);
}

export function selectStop(w: Well, i: number): void {
  set({ ...state, stop: { ...state.stop, [w]: i } });
}

/** The colour of the stop being edited. */
export function stopColor(w: Well): Color | null {
  const g = shownStyle(w);
  return g ? g.stops[Math.min(state.stop[w], g.stops.length - 1)].color : null;
}

export function setStopColor(w: Well, c: Color): void {
  edit(w, (g) => ({ ...g, stops: g.stops.map((s, i) => (i === Math.min(state.stop[w], g.stops.length - 1) ? { ...s, color: c } : s)) }));
}

/** Adds a stop at `at` (0 to 1) in the colour the gradient already has there, and picks it. */
export function addStop(w: Well, at: number): void {
  const g = shownStyle(w);
  if (!g) return;
  const t = Math.max(0, Math.min(1, at));
  const stops = sortedStops([...g.stops, { at: t, color: colorAt(g.stops, t) }]);
  edit(w, (x) => ({ ...x, stops }), stops.findIndex((s) => s.at === t));
}

/** Moves a stop along the bar. Returns its new index (stops stay in order). */
export function moveStop(w: Well, i: number, at: number): number {
  const g = shownStyle(w);
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
  const g = shownStyle(w);
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

/** A gradient style laid on a shape: it keeps where its ends are when only the colours changed, unless `place` is set. */
function lay(paths: FillShape['paths'], had: Gradient | undefined, style: GradientStyle, place: boolean): Gradient | undefined {
  if (had && had.kind === style.kind && !place) return { ...had, stops: sortedStops(style.stops) };
  const b = pathsBounds(paths);
  return b ? placeGradient(style, b) : had;
}

/**
 * Changes the selected shapes' own gradient on one side: `next` says what each should hold (a style, or null for a
 * plain colour). The box is left alone. The plain colour on the shape follows the gradient's first colour, so
 * anything that only understands one colour still gets a sensible one.
 */
function writeSelection(w: Well, next: (had: Gradient | undefined) => GradientStyle | null, place: boolean): void {
  const keep = new Set(paintTargets(w).map((s) => s.id));
  if (!keep.size) return;
  const label = next(undefined) ? 'Change gradient' : w === 'fill' ? 'Change fill colour' : 'Change stroke colour';
  editActiveDrawing(
    label,
    'vector',
    (dr) => {
      for (const s of dr.shapes) {
        if (!keep.has(s.id) || (s.type !== 'fill' && s.type !== 'path')) continue;
        const had = gradientOn(s as Painted, w);
        const style = next(had);
        const g = style ? lay(s.paths, had, style, place) : undefined;
        const plain = g ? firstColor(g) : had ? firstColor(had) : null;
        if (s.type === 'fill') {
          if (g) s.gradient = g;
          else delete s.gradient;
          if (plain) s.color = plain;
        } else if (w === 'fill') {
          if (g) s.fillGradient = g;
          else delete s.fillGradient;
          if (plain && s.fill) s.fill = plain;
        } else {
          if (g) s.strokeGradient = g;
          else delete s.strokeGradient;
          if (plain && s.stroke) s.stroke.color = plain;
        }
      }
    },
    { coalesce: `gradient-${w}-${gesture}` },
  );
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
    { coalesce: `gradient-${w}-${gesture}` },
  );
}

// A box set to none drops its gradient, so turning it back on starts from a plain colour.
// Picking shapes also brings forward the side that has the gradient (a sky with a gradient fill and a plain outline
// shows its fill, not the outline), and starts the marker choice again at the first colour.
let lastPick = '';

/** Called whenever the selection may have changed (the store tells it; tests call it by hand, as their store is a fresh one). */
export function followPick(): void {
  const ui = store().get().ui;
  const pick = ui.selection.join(',');
  if (pick === lastPick) return;
  lastPick = pick;
  if (!pick) return;
  // A gradient on a side outranks a plain colour there, and a plain colour outranks nothing at all.
  const holds = (w: Well) => {
    const p = selectionPaint(w).state;
    return p === 'same' || p === 'differ' ? 2 : colourTargets(w).length ? 1 : 0;
  };
  const other: Well = ui.activeWell === 'fill' ? 'stroke' : 'fill';
  if (holds(other) > holds(ui.activeWell)) store().setUi({ activeWell: other });
  if (state.stop.fill || state.stop.stroke) set({ ...state, stop: { fill: 0, stroke: 0 } });
}

store().subscribe(() => {
  const ui = store().get().ui;
  if (state.fill && !ui.fillColor) set({ ...state, fill: null });
  if (state.stroke && !ui.strokeOn) set({ ...state, stroke: null });
  followPick();
});
