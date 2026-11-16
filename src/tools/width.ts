/**
 * The Width tool: grab a line anywhere along it and drag its edge to make it fatter or thinner right there. It edits the
 * line's width stops (the same ones Line style's Fat in the middle, Tapers to a point and the rest set), so a preset is a
 * starting point and the tool finishes the job by hand. Works on lines and outlines from the Pen, Line and shape tools.
 * The maths is in src/geometry/widthEdit.ts.
 */
import { useSyncExternalStore } from 'react';
import type { Id, PathShape, Shape, WidthStop } from '../core/format';
import { registerCommands, registerHelp, registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { say } from '../core/reasons';
import { store } from '../core/store';
import { topShapeAt } from '../canvas/geometry';
import { cleanWidths, widthAt } from '../geometry/lineStyle';
import { addStopHere, grabOffset, moveStop, nearestSpot, removeStop, spotAt, stopHandles, widthFromDrag, type Spot } from '../geometry/widthEdit';
import { canEdit } from './util';
import { activeDrawing, activeLayer, editActiveDrawing } from './edit';
import { pickTool } from './pick';
import { drawPoint, ink, GRAB_PX } from './point-handles';
import { WidthOptions } from './options/WidthOptions';

type Inked = PathShape & { stroke: NonNullable<PathShape['stroke']> };
const inked = (s: Shape | undefined): s is Inked => !!s && s.type === 'path' && !!s.stroke && s.stroke.width > 0;

let targetId: Id | null = null;
let sub = 0;
let picked: number | null = null;
let drag: { index: number; key: string; mode: 'width' | 'slide'; spot: Spot; grab: number } | null = null;
let gestureCount = 0;
const listeners = new Set<() => void>();
const changed = () => {
  for (const fn of listeners) fn();
};

/** The line being shaped: the one clicked, or else the one selected with the Select tool. */
export function widthTarget(): Inked | null {
  const d = activeDrawing();
  if (!d || d.kind !== 'vector') return null;
  const byId = targetId ? d.shapes.find((s) => s.id === targetId) : undefined;
  if (inked(byId)) return byId;
  const sel = new Set(store().get().ui.selection);
  const s = d.shapes.find((x) => sel.has(x.id) && inked(x));
  return (s as Inked | undefined) ?? null;
}

/** Writes new width stops on the target (null = an even line), as one undo step per gesture (`key`). */
function writeStops(stops: WidthStop[] | null, label: string, key?: string): void {
  const t = widthTarget();
  if (!t) return;
  const id = t.id;
  editActiveDrawing(
    label,
    'vector',
    (d) => {
      const s = d.shapes.find((x) => x.id === id);
      if (!s || s.type !== 'path' || !s.stroke) return;
      if (stops) s.stroke.widths = stops;
      else delete s.stroke.widths;
    },
    key ? { coalesce: key } : {},
  );
}

/** For the options panel and the Delete key. */
export function pickedStop(): { canDelete: boolean } | null {
  const t = widthTarget();
  if (!t || picked === null || !cleanWidths(t.stroke.widths)?.[picked]) return null;
  return { canDelete: true };
}

export function deletePickedStop(): void {
  const t = widthTarget();
  const s = t && cleanWidths(t.stroke.widths);
  if (!t || !s || picked === null || !s[picked]) return;
  writeStops(removeStop(s, picked), 'Take away a width point');
  picked = null;
  changed();
}

/** Back to the same width all the way along, on the line being shaped. */
export function makeEven(): void {
  if (!widthTarget()) return;
  writeStops(null, 'Make the line the same width all the way');
  picked = null;
  changed();
}

export function useWidthTarget() {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      const off = store().subscribe(fn);
      return () => {
        listeners.delete(fn);
        off();
      };
    },
    () => `${targetId}|${picked}|${store().get().doc === undefined}`,
  );
  const t = widthTarget();
  return t ? { stops: cleanWidths(t.stroke.widths)?.length ?? 0, picked: pickedStop() } : null;
}

/** The stop (and which end of it) under the pointer, if any. */
function hitStop(t: Inked, p: { x: number; y: number }, zoom: number): number | null {
  const sp = t.paths[sub] ?? t.paths[0];
  if (!sp) return null;
  const tol = GRAB_PX / zoom;
  let best: number | null = null;
  let bd = tol;
  for (const h of stopHandles(sp, t.stroke.widths, t.stroke.width)) {
    for (const q of [h.left, h.right, h.centre]) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= bd) {
        bd = d;
        best = h.index;
      }
    }
  }
  return best;
}

/** The nearest place on the target's lines, if the pointer is on the line or close to its edge. */
function hitLine(t: Inked, p: { x: number; y: number }, zoom: number): (Spot & { dist: number; sub: number }) | null {
  let best: (Spot & { dist: number; sub: number }) | null = null;
  t.paths.forEach((sp, i) => {
    const n = nearestSpot(sp, p);
    if (n && (!best || n.dist < best.dist)) best = { ...n, sub: i };
  });
  if (!best) return null;
  const b = best as Spot & { dist: number; sub: number };
  const half = (widthAt(cleanWidths(t.stroke.widths), b.t) * t.stroke.width) / 2;
  return b.dist <= half + GRAB_PX / zoom ? b : null;
}

export const widthTool: Tool = {
  id: 'width',
  label: 'Width',
  commandLabel: 'Make a line fat or thin along its length (Width tool)',
  icon: 'width',
  layers: ['vector'],
  // Off the rail and the menus, which are full: reached from the palette and from Edit points.
  railless: true,
  help: 'tool-width',
  cursor: 'default',
  options: WidthOptions,
  down(e: ToolPointer, ctx: ToolContext) {
    if (!canEdit(ctx, 'vector', 'The Width tool')) return;
    const key = `width-${++gestureCount}`;
    const t = widthTarget();
    if (t) {
      const stops = cleanWidths(t.stroke.widths);
      // A point already on the line: grab it (Alt+click takes it away; Shift+drag slides it along).
      const hit = hitStop(t, e, ctx.zoom);
      if (hit !== null && stops) {
        targetId = t.id;
        if (e.alt) {
          picked = null;
          writeStops(removeStop(stops, hit), 'Take away a width point');
          changed();
          ctx.requestOverlay();
          return;
        }
        picked = hit;
        const sp = t.paths[sub] ?? t.paths[0];
        const spot = spotAt(sp, stops[hit].at);
        if (spot) {
          drag = { index: hit, key, mode: e.shift ? 'slide' : 'width', spot, grab: grabOffset(spot, e, stops[hit].w, t.stroke.width) };
          changed();
          ctx.requestOverlay();
          return;
        }
      }
      // Somewhere along the line: put a point there that leaves it looking the same, then drag it.
      const on = hitLine(t, e, ctx.zoom);
      if (on) {
        targetId = t.id;
        sub = on.sub;
        const added = addStopHere(t.stroke.widths, on.t);
        writeStops(added.stops, 'Change the line width', key);
        picked = added.index;
        const spot = spotAt(t.paths[sub], on.t) ?? on;
        drag = { index: added.index, key, mode: 'width', spot, grab: grabOffset(spot, e, added.stops[added.index].w, t.stroke.width) };
        changed();
        ctx.requestOverlay();
        return;
      }
    }
    // Not on the line being shaped: pick up whichever line is under the pointer.
    const d = activeDrawing();
    const under = d && d.kind === 'vector' ? topShapeAt(d.shapes, e.x, e.y, 4 / ctx.zoom) : undefined;
    if (inked(under)) {
      targetId = under.id;
      sub = 0;
      picked = null;
      store().setUi({ selection: [under.id] });
    } else {
      if (under && under.type === 'stroke') ctx.hint('Brush lines take their width from the pen’s pressure. To shape the width by hand, draw the line with the Pen or the Line tool.');
      else if (under) ctx.hint('That one has no outline to make fat or thin. The Width tool works on lines and outlines.');
      targetId = null;
      picked = null;
    }
    changed();
    ctx.requestOverlay();
  },
  move(e, ctx) {
    if (!drag) return;
    const t = widthTarget();
    const stops = t && cleanWidths(t.stroke.widths);
    if (!t || !stops || !stops[drag.index]) return;
    if (drag.mode === 'slide') {
      const n = nearestSpot(t.paths[sub] ?? t.paths[0], e);
      if (n) writeStops(moveStop(stops, drag.index, stops[drag.index].w, n.t), 'Slide a width point', drag.key);
    } else {
      writeStops(moveStop(stops, drag.index, widthFromDrag(drag.spot, e, drag.grab, t.stroke.width)), 'Change the line width', drag.key);
    }
    ctx.requestOverlay();
  },
  up(e, ctx) {
    if (drag) widthTool.move!(e, ctx);
    drag = null;
    ctx.requestOverlay();
  },
  cancel(ctx) {
    drag = null;
    ctx.requestOverlay();
  },
  onKey(e, ctx) {
    if (!widthTarget()) return false;
    if ((e.key === 'Delete' || e.key === 'Backspace') && picked !== null) {
      deletePickedStop();
      ctx.requestOverlay();
      return true;
    }
    if (e.key === 'Escape') {
      if (picked !== null) picked = null;
      else {
        targetId = null;
        store().setUi({ selection: [] });
      }
      changed();
      ctx.requestOverlay();
      return true;
    }
    return false;
  },
  leave() {
    targetId = null;
    picked = null;
    drag = null;
    sub = 0;
    changed();
  },
  overlay(g, ctx) {
    const t = widthTarget();
    if (!t) return;
    const sp = t.paths[sub] ?? t.paths[0];
    if (!sp) return;
    const z = ctx.zoom;
    const c = ink();
    stopHandles(sp, t.stroke.widths, t.stroke.width).forEach((h) => {
      g.save();
      g.lineWidth = 1.25 / z;
      g.strokeStyle = c;
      g.beginPath();
      g.moveTo(h.left.x, h.left.y);
      g.lineTo(h.right.x, h.right.y);
      g.stroke();
      g.restore();
      const on = picked === h.index;
      drawPoint(g, h.left, z, { on });
      drawPoint(g, h.right, z, { on });
    });
  },
};

/** For tests. */
export function resetWidthTool(): void {
  targetId = null;
  picked = null;
  drag = null;
  sub = 0;
}

registerTool(widthTool);

registerCommands([
  {
    id: 'width.tool',
    label: 'Make a line fat or thin along its length (Width tool)',
    category: 'Vector',
    description: 'Pick the Width tool: click a line, then drag its edge to make it fatter or thinner right there. Drag more points in to ink it exactly how you want.',
    help: 'tool-width',
    keywords: ['width tool', 'variable width', 'fat', 'thin', 'thick', 'line weight', 'taper', 'swell', 'inking', 'calligraphy', 'stroke width'],
    enabled: () => activeLayer().layer?.kind === 'vector',
    reason: say('Pick a vector layer first, because the Width tool shapes vector lines.'),
    run: () => pickTool('width'),
  },
]);

registerHelp({
  id: 'tool-width',
  title: 'Width tool',
  section: 'Drawing',
  media: 'tool-width.mp4',
  summary: 'Make a line fat or thin right where you grab it, by dragging its edge: the difference between a line and a good line.',
  keywords: ['width', 'width tool', 'variable width', 'fat', 'thin', 'thick', 'taper', 'swell', 'pinch', 'line weight', 'inking', 'calligraphy', 'stroke width'],
});
