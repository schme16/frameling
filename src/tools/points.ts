/**
 * Edit points [A] (direct select): change the points and curve handles of a shape. Click a shape to see its points.
 * Drag a point to move it, drag a handle to bend the curve (Alt bends one side only), click the line between two
 * points to add one, Alt+click a point to switch it between a sharp corner and a smooth curve, and Delete to take
 * the chosen point away. Works on pen paths, shapes, clean pencil lines and paint (fills), in either drawing mode.
 */
import { useSyncExternalStore } from 'react';
import type { FillShape, Id, PathShape, Shape, SubPath } from '../core/format';
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { subPathsToPath2D } from '../core/render';
import { store } from '../core/store';
import { topShapeAt } from '../canvas/geometry';
import { deletePoint, fromAnchors, handlesInLine, insertPoint, moveAnchor, moveHandle, nearestOnPath, toAnchors, toggleSmooth, type Anchor, type P } from '../geometry/pen';
import { activeDrawing, editActiveDrawing } from './edit';
import { canEdit, reportEdit } from './util';
import { drawAnchor, drawGuidePath, GRAB_PX } from './point-handles';
import { PointsOptions } from './options/PointsOptions';

type Editable = FillShape | PathShape;
const editable = (s: Shape | undefined): s is Editable => !!s && (s.type === 'path' || s.type === 'fill');

interface Picked {
  sub: number;
  i: number;
}

let targetId: Id | null = null;
let picked: Picked | null = null;
let drag: { kind: 'point' | 'hin' | 'hout'; sub: number; i: number; key: string; mirror: boolean } | null = null;
let gestureCount = 0;
const listeners = new Set<() => void>();
const changed = () => {
  for (const fn of listeners) fn();
};

/** The shape whose points are showing: the one clicked, or else the one selected with the Select tool. */
export function pointsTarget(): Editable | null {
  const d = activeDrawing();
  if (!d || d.kind !== 'vector') return null;
  const byId = targetId ? d.shapes.find((s) => s.id === targetId) : undefined;
  if (editable(byId)) return byId;
  const sel = new Set(store().get().ui.selection);
  const s = d.shapes.find((x) => sel.has(x.id) && editable(x));
  return (s as Editable | undefined) ?? null;
}

/** Writes new anchors for one subpath of the target, as one undo step per gesture (`key`). */
function writeSub(sub: number, anchors: Anchor[], label: string, key?: string): void {
  const t = pointsTarget();
  if (!t) return;
  const id = t.id;
  const closed = t.paths[sub].closed;
  const sp = fromAnchors(anchors, closed);
  editActiveDrawing(
    label,
    'vector',
    (d) => {
      const s = d.shapes.find((x) => x.id === id);
      if (s && (s.type === 'path' || s.type === 'fill')) s.paths[sub] = sp as never;
    },
    key ? { coalesce: key } : {},
  );
}

const anchorsOf = (t: Editable, sub: number) => toAnchors(t.paths[sub]);

/** The least points a subpath can keep: two for a line, three for a closed shape. */
const minPoints = (sp: SubPath) => (sp.closed ? 3 : 2);

// ---------------------------------------------------------------- actions (also on the options panel)

export function pickedPoint(): { smooth: boolean; canDelete: boolean } | null {
  const t = pointsTarget();
  if (!t || !picked || !t.paths[picked.sub]) return null;
  const a = anchorsOf(t, picked.sub)[picked.i];
  if (!a) return null;
  return { smooth: !!(a.hin || a.hout), canDelete: t.paths[picked.sub].points.length > minPoints(t.paths[picked.sub]) };
}

export function togglePickedSmooth(): void {
  const t = pointsTarget();
  if (!t || !picked) return;
  const sp = t.paths[picked.sub];
  writeSub(picked.sub, toggleSmooth(toAnchors(sp), picked.i, sp.closed), 'Change point');
  changed();
}

export function deletePickedPoint(ctx?: ToolContext): void {
  const t = pointsTarget();
  if (!t || !picked) return;
  const sp = t.paths[picked.sub];
  if (sp.points.length <= minPoints(sp)) {
    ctx?.hint(sp.closed ? 'A closed shape needs at least three points.' : 'A line needs at least two points.');
    return;
  }
  writeSub(picked.sub, deletePoint(toAnchors(sp), picked.i), 'Delete point');
  picked = { sub: picked.sub, i: Math.max(0, picked.i - 1) };
  changed();
}

export function usePickedPoint() {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      const off = store().subscribe(fn);
      return () => {
        listeners.delete(fn);
        off();
      };
    },
    () => `${targetId}|${picked?.sub}|${picked?.i}|${store().get().doc === undefined}`,
  );
  return pickedPoint();
}

// ---------------------------------------------------------------- hit testing

type Hit = { kind: 'hin' | 'hout' | 'point'; sub: number; i: number } | { kind: 'segment'; sub: number; seg: number; t: number } | null;

function hitTarget(t: Editable, p: P, zoom: number): Hit {
  const tol = GRAB_PX / zoom;
  const d = (q: P) => Math.hypot(q.x - p.x, q.y - p.y);
  // Handles of the chosen point first (they sit on top), then points, then the lines between.
  if (picked && t.paths[picked.sub]) {
    const a = anchorsOf(t, picked.sub)[picked.i];
    if (a?.hout && d(a.hout) <= tol) return { kind: 'hout', sub: picked.sub, i: picked.i };
    if (a?.hin && d(a.hin) <= tol) return { kind: 'hin', sub: picked.sub, i: picked.i };
  }
  let best: Hit = null;
  let bd = tol;
  t.paths.forEach((sp, sub) => {
    toAnchors(sp).forEach((a, i) => {
      if (d(a) <= bd) {
        bd = d(a);
        best = { kind: 'point', sub, i };
      }
    });
  });
  if (best) return best;
  t.paths.forEach((sp, sub) => {
    const n = nearestOnPath(toAnchors(sp), sp.closed, p);
    if (n && n.dist <= tol && (!best || n.dist < bd)) {
      bd = n.dist;
      best = { kind: 'segment', sub, seg: n.seg, t: n.t };
    }
  });
  return best;
}

// ---------------------------------------------------------------- the tool

export const pointsTool: Tool = {
  id: 'points',
  group: 'select',
  groupAt: 2,
  label: 'Edit points',
  icon: 'points',
  key: 'a',
  layers: ['vector'],
  order: 6,
  help: 'tool-points',
  cursor: 'default',
  options: PointsOptions,
  down(e: ToolPointer, ctx: ToolContext) {
    if (!canEdit(ctx, 'vector', 'Edit points')) return;
    const key = `points-${++gestureCount}`;
    const t = pointsTarget();
    const hit = t ? hitTarget(t, e, ctx.zoom) : null;
    if (t && hit) {
      targetId = t.id;
      if (hit.kind === 'segment') {
        // A click on the line adds a point there, ready to drag.
        const sp = t.paths[hit.sub];
        writeSub(hit.sub, insertPoint(toAnchors(sp), hit.seg, hit.t), 'Add point', key);
        picked = { sub: hit.sub, i: hit.seg + 1 };
        drag = { kind: 'point', sub: hit.sub, i: hit.seg + 1, key, mirror: true };
      } else if (hit.kind === 'point' && e.alt) {
        picked = { sub: hit.sub, i: hit.i };
        togglePickedSmooth();
      } else {
        if (hit.kind === 'point') picked = { sub: hit.sub, i: hit.i };
        const a = anchorsOf(t, hit.sub)[hit.i];
        drag = { kind: hit.kind, sub: hit.sub, i: hit.i, key, mirror: !e.alt && handlesInLine(a) };
      }
      changed();
      ctx.requestOverlay();
      return;
    }
    // Not on the shape being edited: pick up whichever shape is under the pointer.
    const d = activeDrawing();
    const under = d && d.kind === 'vector' ? topShapeAt(d.shapes, e.x, e.y, 4 / ctx.zoom) : undefined;
    if (editable(under)) {
      targetId = under.id;
      picked = null;
      store().setUi({ selection: [under.id] });
    } else {
      if (under && under.type === 'stroke') ctx.hint('Brush lines are made of many tiny points. To bend a line by its points, draw it with the Pen, or the Pencil set to Clean line.');
      else if (under) ctx.hint("That one has no points to edit. Edit points works on shapes, pen and clean pencil lines, and paint.");
      targetId = null;
      picked = null;
    }
    changed();
    ctx.requestOverlay();
  },
  move(e, ctx) {
    if (!drag) return;
    const t = pointsTarget();
    if (!t || !t.paths[drag.sub]) return;
    const anchors = anchorsOf(t, drag.sub);
    const next = drag.kind === 'point' ? moveAnchor(anchors, drag.i, e) : moveHandle(anchors, drag.i, drag.kind, e, drag.mirror && !e.alt);
    writeSub(drag.sub, next, drag.kind === 'point' ? 'Move point' : 'Bend curve', drag.key);
    ctx.requestOverlay();
  },
  up(e, ctx) {
    if (drag) pointsTool.move!(e, ctx);
    drag = null;
    ctx.requestOverlay();
  },
  cancel(ctx) {
    drag = null;
    ctx.requestOverlay();
  },
  onKey(e, ctx) {
    if (!pointsTarget()) return false;
    if ((e.key === 'Delete' || e.key === 'Backspace') && picked) {
      deletePickedPoint(ctx);
      return true;
    }
    if (e.key === 'Escape') {
      if (picked) picked = null;
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
    changed();
  },
  overlay(g, ctx) {
    const t = pointsTarget();
    if (!t) return;
    const z = ctx.zoom;
    drawGuidePath(g, subPathsToPath2D(t.paths), z);
    t.paths.forEach((sp, sub) => {
      const anchors = toAnchors(sp);
      const n = anchors.length;
      anchors.forEach((a, i) => {
        const on = !!picked && picked.sub === sub && picked.i === i;
        // Handles show on the chosen point and on the sides of its neighbours that face it.
        const nearPicked = !!picked && picked.sub === sub && (Math.abs(picked.i - i) === 1 || (sp.closed && Math.abs(picked.i - i) === n - 1));
        const shown: Anchor = on ? a : nearPicked ? { x: a.x, y: a.y, ...((picked!.i - i + n) % n === 1 && a.hout ? { hout: a.hout } : {}), ...((i - picked!.i + n) % n === 1 && a.hin ? { hin: a.hin } : {}) } : { x: a.x, y: a.y };
        drawAnchor(g, shown, z, { on });
      });
    });
  },
};

/** For tests. */
export function resetPointsTool(): void {
  targetId = null;
  picked = null;
  drag = null;
}

registerTool(pointsTool);
