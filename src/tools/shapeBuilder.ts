/**
 * The Shape builder: where shapes overlap, they make little regions (the lens where two circles cross, each crescent).
 * Drag across the regions you want as one shape; Alt-drag across the ones you want gone. The region under the pointer
 * lights up as you go, and nothing in the drawing changes until you let go, so the whole drag is one undo step.
 *
 * The maths is the same clipping Join and Cut out use; src/geometry/regions.ts cuts the shapes into regions and builds
 * the new ones, and this file is the pointer, the highlight and the words.
 */
import { useSyncExternalStore } from 'react';
import type { Id, Shape } from '../core/format';
import { registerChoice, withChoice } from '../core/choices';
import { registerHelp, registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { cssVar } from '../canvas/theme';
import { toast } from '../ui/toast';
import { choiceWord } from '../words/choices';
import { combinable } from '../geometry/boolean';
import { union, type Geom } from '../geometry/merge';
import { along, applyBuild, buildRegions, clusterAt, lookMatters, plansNothing, regionAt, type Arrangement, type BuildLook, type Region } from '../geometry/regions';
import { canEdit } from './util';
import { activeDrawing, activeLayer } from './edit';
import { editShapes } from './merge-mode';
import { ShapeBuilderOptions } from './options/ShapeBuilderOptions';

registerChoice<BuildLook>({
  id: 'shapes.buildLook',
  title: choiceWord('choice.shapes.buildLook.title'),
  question: choiceWord('choice.shapes.buildLook.question'),
  options: [
    { value: 'dragged', label: choiceWord('choice.shapes.buildLook.dragged.label'), detail: choiceWord('choice.shapes.buildLook.dragged.detail'), did: choiceWord('choice.shapes.buildLook.dragged.did') },
    { value: 'bottom', label: choiceWord('choice.shapes.buildLook.bottom.label'), detail: choiceWord('choice.shapes.buildLook.bottom.detail'), did: choiceWord('choice.shapes.buildLook.bottom.did') },
  ],
  default: 'dragged',
  category: 'Drawing',
  help: 'tool-shape-builder',
});

// ---------------------------------------------------------------- what a plain drag does

export type BuildMode = 'join' | 'remove';
let mode: BuildMode = 'join';
const listeners = new Set<() => void>();
const changed = () => {
  for (const fn of listeners) fn();
};
export function setBuildMode(m: BuildMode): void {
  mode = m;
  changed();
}
export const buildMode = (): BuildMode => mode;
export function useBuildMode(): BuildMode {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    () => mode,
  );
}
/** Alt flips what a drag does for that drag, and so does Shift: some desktops keep Alt+drag for moving the window. */
const flipped = (e: { alt: boolean; shift: boolean }) => e.alt || e.shift;
const modeFor = (e: { alt: boolean; shift: boolean }): BuildMode => (flipped(e) ? (mode === 'join' ? 'remove' : 'join') : mode);

// ---------------------------------------------------------------- the regions being worked on

interface Cache {
  shapes: readonly Shape[];
  selection: string;
  /** Picked shapes, or whatever lies around the pointer. */
  from: 'picked' | 'near';
  ids: string;
  arr: Arrangement;
}
let cache: Cache | null = null;

const idsOf = (list: readonly Shape[]) => list.map((s) => s.id).join('|');

/** The regions for the pointer: of the picked shapes when two or more are picked, else of the shapes lying around it. */
function arrangementAt(x: number, y: number): Arrangement | null {
  const d = activeDrawing();
  if (!d || d.kind !== 'vector') return null;
  const sel = store().get().ui.selection;
  const selKey = sel.join('|');
  const picked = d.shapes.filter((s) => sel.includes(s.id) && combinable(s));
  if (picked.length >= 2) {
    const ids = idsOf(picked);
    if (cache && cache.shapes === d.shapes && cache.from === 'picked' && cache.ids === ids) return cache.arr;
    cache = { shapes: d.shapes, selection: selKey, from: 'picked', ids, arr: buildRegions(picked) };
    return cache.arr;
  }
  // Nothing worth working on is picked: stay with the last set while the pointer is still over one of its regions.
  if (cache && cache.shapes === d.shapes && cache.from === 'near' && regionAt(cache.arr, x, y)) return cache.arr;
  const near = clusterAt(d.shapes, x, y);
  if (!near.length) return cache && cache.shapes === d.shapes && cache.from === 'near' ? cache.arr : null;
  const ids = idsOf(near);
  if (cache && cache.shapes === d.shapes && cache.from === 'near' && cache.ids === ids) return cache.arr;
  cache = { shapes: d.shapes, selection: selKey, from: 'near', ids, arr: buildRegions(near) };
  return cache.arr;
}

// ---------------------------------------------------------------- the gesture

interface Drag {
  mode: BuildMode;
  arr: Arrangement;
  /** Regions crossed so far, in order. */
  ids: number[];
  trail: { x: number; y: number }[];
  /** The region the pointer was last in, tried first for the next point. */
  near: number | null;
}
let drag: Drag | null = null;
let hover: { arr: Arrangement; id: number; mode: BuildMode } | null = null;
let unionCache: { ids: string; geom: Geom | null } | null = null;

const sameHover = (a: typeof hover, b: typeof hover) => a === b || (!!a && !!b && a.arr === b.arr && a.id === b.id && a.mode === b.mode);

function crossInto(d: Drag, x: number, y: number): void {
  const r = regionAt(d.arr, x, y, d.near);
  d.near = r ? r.id : null;
  if (r && !d.ids.includes(r.id)) d.ids.push(r.id);
}

const bits = (n: number) => `${n} bit${n === 1 ? '' : 's'}`;

function words(res: { joined: number; removed: number }, look: BuildLook, differ: boolean): string {
  if (res.removed) return `Took away ${bits(res.removed)}.`;
  if (res.joined === 1) return 'Pulled that bit out as a shape of its own.';
  const colours = !differ ? '' : look === 'dragged' ? ' It wears the colours of the bit you started on.' : ' It wears the bottom shape’s colours.';
  return `Joined ${bits(res.joined)} into one shape.${colours}`;
}

/** Makes what the drag asked for, as one undo step. */
function commit(d: Drag, ctx: ToolContext): void {
  const plan = d.mode === 'join' ? { join: d.ids, remove: [] } : { join: [], remove: d.ids };
  if (!d.ids.length) return;
  if (plansNothing(d.arr, plan)) return ctx.hint('That one is a whole shape already. Drag across two or more bits to join them, or Alt-drag to take one away.');
  const label = d.mode === 'join' ? (d.ids.length === 1 ? 'Pull a bit out as a shape' : 'Join bits into a shape') : 'Take bits away';
  const go = (look: BuildLook) => {
    let result: ReturnType<typeof applyBuild> = 'nothing';
    const r = editShapes(label, (before) => {
      // Not if the drawing has changed since the regions were worked out.
      const ids = new Set(before.map((s) => s.id));
      if (!d.arr.shapes.every((s) => ids.has(s.id))) return null;
      result = applyBuild(before, d.arr, plan, look);
      return result === 'nothing' ? null : result.shapes;
    });
    if (r !== 'ok' || result === 'nothing') return void (r !== 'ok' && r !== 'nothing' && ctx.hint(`Couldn’t build that: ${r}.`));
    store().setUi({ selection: (result as { ids: Id[] }).ids });
    toast(words(result as { joined: number; removed: number }, look, lookMatters(d.arr, d.ids)));
  };
  withChoice<BuildLook>('shapes.buildLook', go, { matters: d.mode === 'join' && lookMatters(d.arr, d.ids), gently: true });
}

export const shapeBuilderTool: Tool = {
  id: 'shape-builder',
  label: 'Shape builder',
  commandLabel: 'Join or take away the bits where shapes overlap (Shape builder)',
  icon: 'shape-builder',
  key: 'Shift+N',
  layers: ['vector'],
  group: 'shapes',
  groupAt: 5,
  order: 66,
  help: 'tool-shape-builder',
  cursor: 'default',
  options: ShapeBuilderOptions,
  down(e: ToolPointer, ctx: ToolContext) {
    if (!canEdit(ctx, 'vector', 'The Shape builder')) return;
    const arr = arrangementAt(e.x, e.y);
    if (!arr || !arr.regions.length) return void ctx.hint('Nothing to build here. Draw two or more shapes that overlap, then drag across the bits.');
    drag = { mode: modeFor(e), arr, ids: [], trail: [{ x: e.x, y: e.y }], near: null };
    hover = null;
    crossInto(drag, e.x, e.y);
    if (!drag.ids.length) ctx.hint('Start the drag on a shape.');
    ctx.requestOverlay();
  },
  move(e: ToolPointer, ctx: ToolContext) {
    if (!drag) return;
    const last = drag.trail[drag.trail.length - 1];
    for (const p of along(last, e, 3 / ctx.zoom)) crossInto(drag, p.x, p.y);
    drag.trail.push({ x: e.x, y: e.y });
    if (drag.trail.length > 400) drag.trail.splice(1, 100);
    ctx.requestOverlay();
  },
  up(e: ToolPointer, ctx: ToolContext) {
    if (!drag) return;
    shapeBuilderTool.move!(e, ctx);
    const d = drag;
    drag = null;
    unionCache = null;
    if (d.ids.length) commit(d, ctx);
    cache = null;
    hover = null;
    ctx.requestOverlay();
  },
  hover(e: ToolPointer, ctx: ToolContext) {
    const arr = activeLayer().layer?.kind === 'vector' ? arrangementAt(e.x, e.y) : null;
    const r = arr ? regionAt(arr, e.x, e.y, hover && hover.arr === arr ? hover.id : null) : null;
    const next = arr && r ? { arr, id: r.id, mode: modeFor(e) } : null;
    if (sameHover(hover, next)) return;
    hover = next;
    ctx.requestOverlay();
  },
  cancel(ctx: ToolContext) {
    drag = null;
    hover = null;
    unionCache = null;
    ctx.requestOverlay();
  },
  leave() {
    drag = null;
    hover = null;
    cache = null;
    unionCache = null;
  },
  overlay(g: CanvasRenderingContext2D, ctx: ToolContext) {
    const z = ctx.zoom;
    const join = cssVar('--grape', '#9b7bff');
    const away = cssVar('--rose', '#ff6f91');
    const arr = drag?.arr ?? hover?.arr ?? cache?.arr;
    if (!arr) return;
    // Every region, faint, so you can see what is there to pick up.
    g.save();
    g.lineWidth = 1 / z;
    g.strokeStyle = join;
    g.globalAlpha = 0.28;
    g.setLineDash([3 / z, 3 / z]);
    for (const r of arr.regions) outline(g, r.geom, false);
    g.restore();
    if (drag) {
      const col = drag.mode === 'join' ? join : away;
      for (const id of drag.ids) light(g, arr.regions[id], col, z, drag.mode === 'remove', 0.4);
      if (drag.mode === 'join' && drag.ids.length > 1) {
        // The one shape these make, outlined as a whole.
        const key = drag.ids.join(',');
        if (!unionCache || unionCache.ids !== key) unionCache = { ids: key, geom: joinedOutline(drag, arr) };
        if (unionCache.geom) frame(g, unionCache.geom, col, z, 2.4);
      }
      trail(g, drag.trail, col, z);
    } else if (hover && hover.arr === arr) {
      light(g, arr.regions[hover.id], hover.mode === 'join' ? join : away, z, hover.mode === 'remove', 0.3);
    }
  },
};

// ---------------------------------------------------------------- drawing the highlight

function outline(g: CanvasRenderingContext2D, geom: Geom, close = true): void {
  g.beginPath();
  for (const poly of geom)
    for (const ring of poly) {
      ring.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      if (close) g.closePath();
    }
  if (!close) g.closePath();
  g.stroke();
}

/** Two lines, a pale one under a coloured one, so the edge reads on a dark stage, a white page and every colour between. */
function frame(g: CanvasRenderingContext2D, geom: Geom, colour: string, z: number, weight: number): void {
  g.save();
  g.lineJoin = 'round';
  g.beginPath();
  for (const poly of geom)
    for (const ring of poly) {
      ring.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
    }
  g.lineWidth = (weight + 2.4) / z;
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.stroke();
  g.lineWidth = weight / z;
  g.strokeStyle = colour;
  g.stroke();
  g.restore();
}

/** A region tinted, with its edge framed; a region going away also gets diagonal stripes, so it isn't only a colour that says so. */
function light(g: CanvasRenderingContext2D, r: Region | undefined, colour: string, z: number, striped: boolean, alpha: number): void {
  if (!r) return;
  g.save();
  g.beginPath();
  for (const poly of r.geom)
    for (const ring of poly) {
      ring.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
    }
  g.globalAlpha = alpha;
  g.fillStyle = colour;
  g.fill('evenodd');
  g.globalAlpha = 1;
  if (striped) {
    g.save();
    g.clip('evenodd');
    g.strokeStyle = colour;
    g.lineWidth = 1.5 / z;
    const step = 7 / z;
    g.beginPath();
    for (let o = r.box.x0 - (r.box.y1 - r.box.y0); o < r.box.x1; o += step) {
      g.moveTo(o, r.box.y1);
      g.lineTo(o + (r.box.y1 - r.box.y0), r.box.y0);
    }
    g.stroke();
    g.restore();
  }
  g.restore();
  frame(g, r.geom, colour, z, 2);
}

function trail(g: CanvasRenderingContext2D, pts: { x: number; y: number }[], colour: string, z: number): void {
  if (pts.length < 2) return;
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.lineWidth = 5 / z;
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.stroke();
  g.lineWidth = 2.5 / z;
  g.strokeStyle = colour;
  g.stroke();
  g.restore();
}

function joinedOutline(d: Drag, arr: Arrangement): Geom | null {
  const rs = d.ids.map((id) => arr.regions[id]).filter(Boolean);
  if (rs.length < 2) return null;
  return unionOf(rs.map((r) => r.geom));
}

const unionOf = (gs: Geom[]): Geom | null => union(gs[0], ...gs.slice(1));

/** For tests. */
export function resetShapeBuilder(): void {
  drag = null;
  hover = null;
  cache = null;
  unionCache = null;
  mode = 'join';
}

registerTool(shapeBuilderTool);

registerHelp({
  id: 'tool-shape-builder',
  title: 'Shape builder',
  section: 'Drawing',
  media: 'tool-shape-builder.mp4',
  summary: 'Where shapes overlap, drag across the bits you want as one shape, and Alt-drag across the ones you want gone.',
  keywords: ['shape builder', 'builder', 'join', 'merge', 'unite', 'union', 'subtract', 'pathfinder', 'divide', 'overlap', 'overlapping', 'crescent', 'lens', 'cut out', 'delete bit'],
});
