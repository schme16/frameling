/**
 * Select [V]: click a shape, Shift+click to add or remove, or drag a box (or a lasso) round several. Drag a selection to move
 * it, drag a corner to resize (Shift keeps proportions, Alt resizes from the middle), drag the round handle above
 * it to turn it (Shift snaps to 15 degrees). Vector layers only.
 *
 * The drag never touches the document until you let go: the canvas shows a live preview, then one undo step lands.
 */
import type { Id, Shape, VectorDrawing } from '../core/format';
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { cssVar } from '../canvas/theme';
import { requestOverlay, setCursor, setLive } from '../canvas/controller';
import {
  angleFromCentre,
  apply,
  handlePoints,
  hitHandle,
  IDENTITY,
  inflateRect,
  rectContainsPoint,
  rectFromPoints,
  rectsIntersect,
  rotateMatrixForHandle,
  scaleMatrixForHandle,
  shapeBounds,
  shapeOutlines,
  shapesBounds,
  topShapeAt,
  transformShape,
  translate,
  type HandleId,
  type Matrix,
  type Pt,
  type Rect,
} from '../canvas/geometry';
import { shownDrawing } from '../core/symbols';
import { activeDrawing, activeLayer } from './edit';
import { SelectOptions } from './options/SelectOptions';
import { reportEdit } from './util';
import { activeIsMerge, pendingCut, setCut, withGroups } from './merge-mode';
import { cutOut, mergeable, polygonGeom, shapeBox, shapeInsideArea, shapeTouchesArea, type Geom } from '../geometry/merge';
import { modeOfTool, WAYS } from '../select/ways';
import { drawLasso, lassoClosesAt, lassoPoint } from '../select/lasso';
import { MagneticTrace, ringSource, type Ring } from '../select/magnetic';
import { clingReach, getSelectSettings } from '../select/settings';
import { subPathsToPath2D } from '../core/render';
import { angleSteps, clearSnap, snapMove, snapPt } from '../canvas/guides';
import { lockedLayerAt } from '../canvas/lost';
import { landMatrix } from './select-land';

/** How far off (screen pixels) a click can be and still hit a thin line. */
const HIT_TOL = 5;
/** A drag shorter than this (screen pixels) is still a click. */
const DRAG_PX = 3;

/** Shapes whose box touches the rectangle. */
export function shapesInRect(shapes: Shape[], r: Rect): Shape[] {
  return shapes.filter((s) => rectsIntersect(shapeBounds(s), r));
}

type Mode = 'marquee' | 'move' | 'scale' | 'rotate';

interface Gesture {
  mode: Mode;
  start: Pt;
  cur: ToolPointer;
  layerId: Id;
  drawing: VectorDrawing;
  originals: Shape[];
  bounds: Rect | null;
  handle: HandleId | null;
  startAngle: number;
  /** Shift+click on something already selected: it comes off the selection if the click turns out not to be a drag. */
  toggleOffOnClick: Id | null;
  base: Id[];
  moved: boolean;
  /** Lasso mode: the points so far (document pixels). */
  lasso: Pt[] | null;
  /** A lasso left open between Alt+clicks (straight sides), or a polygon, waiting for the next corner. */
  open: boolean;
  /** The Polygon way: every side is straight and each click is a corner, until you close it. */
  poly?: boolean;
  /** The Magnetic way: a polygon whose sides cling to the outlines of the shapes. `lasso` is its fastened points. */
  mag?: MagneticTrace;
  /** The move, resize or turn as last worked out (with snapping), so drawing it doesn't snap again. */
  m?: Matrix;
}

let g: Gesture | null = null;

const selectedIds = (): Id[] => store().get().ui.selection;

/** How far (document pixels) the magnetic lasso reaches for an outline, from the cling setting. */
const reachOf = (ctx: ToolContext): number => clingReach(getSelectSettings().cling) / ctx.zoom;

/** The outlines of the shapes close to a point, which is all the magnetic lasso has to search. */
function outlinesNear(shapes: readonly Shape[]): (p: Pt, reach: number) => Ring[] {
  return (p, reach) => {
    const out: Ring[] = [];
    for (const s of shapes) if (rectContainsPoint(inflateRect(shapeBounds(s), reach), p.x, p.y)) out.push(...shapeOutlines(s));
    return out;
  };
}

/** The selected shapes that are really on the active drawing. */
function selectedOn(d: VectorDrawing): Shape[] {
  const ids = new Set(selectedIds());
  return d.shapes.filter((s) => ids.has(s.id));
}

function setSelection(ids: Id[]): void {
  const cur = selectedIds();
  if (cur.length === ids.length && cur.every((x, i) => x === ids[i])) return;
  store().setUi({ selection: ids });
}

// The drawing as it shows: on an in-between of a tween, its symbols are where they are on this frame, so the box,
// clicks and drags match what you see.
function vectorDrawing(): VectorDrawing | undefined {
  const { layer } = activeLayer();
  const { doc, ui } = store().get();
  const d = layer ? shownDrawing(doc, layer, ui.frame) : activeDrawing();
  return d && d.kind === 'vector' ? d : undefined;
}

/** The matrix the current gesture is applying. With `zoom`, moves and resizes snap to guides and the page. */
function gestureMatrix(s: Gesture, zoom?: number): Matrix {
  const { cur, start } = s;
  if (s.mode === 'move') {
    let dx = cur.x - start.x;
    let dy = cur.y - start.y;
    if (cur.shift) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    if (zoom) {
      const lockX = cur.shift && dx === 0;
      const lockY = cur.shift && dy === 0;
      const snapped = snapMove(s.bounds, dx, dy, zoom, cur.mod);
      dx = lockX ? 0 : snapped.dx;
      dy = lockY ? 0 : snapped.dy;
    }
    return translate(dx, dy);
  }
  if (s.mode === 'scale' && s.bounds && s.handle && s.handle !== 'rotate') {
    const p = zoom ? snapPt(cur, zoom, cur.mod, true) : cur;
    return scaleMatrixForHandle(s.bounds, s.handle, p.x, p.y, cur.shift, cur.alt);
  }
  if (s.mode === 'rotate' && s.bounds) return rotateMatrixForHandle(s.bounds, s.startAngle, cur.x, cur.y, cur.shift && angleSteps());
  return IDENTITY;
}

function updatePreview(s: Gesture, zoom: number): void {
  if (s.mode === 'marquee') return;
  if (!s.moved && Math.hypot(s.cur.x - s.start.x, s.cur.y - s.start.y) * zoom < DRAG_PX) return;
  s.moved = true;
  const m = (s.m = gestureMatrix(s, zoom));
  const moved = new Map(s.originals.map((o) => [o.id, transformShape(o, m)]));
  setLive({ layerId: s.layerId, kind: 'vector', drawing: { ...s.drawing, shapes: s.drawing.shapes.map((x) => moved.get(x.id) ?? x) } });
}

function down(e: ToolPointer, ctx: ToolContext): void {
  // A lasso left open by Alt+click: this click adds the next corner (or closes it).
  if (g?.open && g.lasso && vectorDrawing() !== g.drawing) g = null;
  if (g?.open && g.lasso) {
    g.cur = e;
    // Back on the first corner closes it, whichever way it was started.
    if (lassoClosesAt(g.lasso, e, ctx.zoom)) return finishLasso(g);
    if (g.mag) {
      g.mag.place(e, reachOf(ctx), ctx.zoom);
      return;
    }
    g.lasso.push({ x: e.x, y: e.y });
    // A polygon keeps waiting for the next corner. An Alt lasso waits for the next Alt as you let go.
    g.open = !!g.poly;
    return;
  }
  const { layer } = activeLayer();
  if (layer && layer.kind !== 'vector') return ctx.hint('Select works on vector layers. Pick a vector layer in the timeline first.');
  const d = vectorDrawing();
  if (!layer || !d) {
    if (!e.shift) setSelection([]);
    return;
  }
  // Part of a merged shape picked with a box: the gesture works on the drawing as if it were cut there.
  const cut = pendingCut();
  const originalsNow = cut ? cut.lifted : selectedOn(d);
  const bounds = shapesBounds(originalsNow);
  const drawing = cut ? { ...d, shapes: cut.shapes } : d;
  const base = { layerId: layer.id, drawing, start: { x: e.x, y: e.y }, cur: e, bounds, startAngle: 0, toggleOffOnClick: null as Id | null, base: selectedIds(), moved: false, lasso: null, open: false };

  if (bounds) {
    const h = hitHandle(bounds, e.x, e.y, ctx.zoom);
    if (h) {
      g = { ...base, mode: h === 'rotate' ? 'rotate' : 'scale', originals: originalsNow, handle: h, startAngle: angleFromCentre(bounds, e.x, e.y) };
      return;
    }
  }
  // The magnetic lasso starts at an outline, so a click on a shape begins a trace instead of picking the shape up.
  const picks = modeOfTool(store().get().ui.tool);
  const magnetic = picks === 'magnetic';
  if (cut && !e.shift && !magnetic && topShapeAt(cut.lifted, e.x, e.y, HIT_TOL / ctx.zoom)) {
    g = { ...base, mode: 'move', originals: cut.lifted, handle: null };
    return;
  }
  const hit = magnetic ? undefined : topShapeAt(d.shapes, e.x, e.y, HIT_TOL / ctx.zoom);
  if (hit) {
    // Clicking outside a picked part lets go of it and starts afresh.
    if (cut) setCut(null);
    const ids = new Set(cut ? [] : selectedIds());
    let toggle: Id | null = null;
    // A shape in a group brings the whole group with it.
    const family = withGroups(d.shapes, [hit.id]);
    if (e.shift) {
      if (ids.has(hit.id)) toggle = hit.id;
      else for (const id of family) ids.add(id);
    } else if (!ids.has(hit.id)) {
      ids.clear();
      for (const id of family) ids.add(id);
    }
    const list = d.shapes.filter((s) => ids.has(s.id)).map((s) => s.id);
    setSelection(list);
    const originals = d.shapes.filter((s) => ids.has(s.id));
    g = { ...base, drawing: d, mode: 'move', originals, bounds: shapesBounds(originals), handle: null, toggleOffOnClick: toggle };
    return;
  }
  if (!e.shift) setSelection([]);
  if (!e.shift && !cut) {
    // Clicked something you can see but can't pick: say it's on a locked layer instead of doing nothing.
    const { doc, ui } = store().get();
    const locked = lockedLayerAt(doc, ui.frame, e.x, e.y, layer.id, (shapes, x, y) => topShapeAt(shapes, x, y, HIT_TOL / ctx.zoom));
    if (locked) ctx.hint(`That's on "${locked.name}", which is locked. Unlock it in the timeline to select it.`);
  }
  if (cut) setCut(null);
  const poly = picks === 'polygon' || magnetic;
  let mag: MagneticTrace | undefined;
  if (magnetic) {
    mag = new MagneticTrace(ringSource(outlinesNear(d.shapes)));
    mag.begin(e, reachOf(ctx));
  }
  const lasso = mag ? mag.pts : picks === 'lasso' || poly ? [{ x: e.x, y: e.y }] : null;
  g = { ...base, drawing: d, mode: 'marquee', originals: [], handle: null, base: e.shift ? selectedIds() : [], lasso, open: poly, poly, mag };
}

function move(e: ToolPointer, ctx: ToolContext): void {
  if (!g) return;
  g.cur = e;
  if (g.lasso) {
    // The lasso picks when it closes; until then it's just a line.
    if (g.mag) g.mag.move(e, reachOf(ctx), ctx.zoom);
    else if (!g.open) lassoPoint(g.lasso, e, ctx.zoom);
    return;
  }
  if (g.mode === 'marquee') {
    const r = rectFromPoints(g.start, e);
    const hits = withGroups(g.drawing.shapes, shapesInRect(g.drawing.shapes, r).map((s) => s.id));
    setSelection([...new Set([...g.base, ...hits])]);
  } else {
    updatePreview(g, ctx.zoom);
  }
}

function up(e: ToolPointer, ctx: ToolContext): void {
  const s = g;
  g = null;
  if (!s) return;
  s.cur = e;
  if (s.lasso) {
    // A polygon is built from clicks, so letting go of one does nothing but wait for the next corner.
    if (s.poly) {
      s.open = true;
      g = s;
      ctx.requestOverlay();
      return;
    }
    lassoPoint(s.lasso, e, ctx.zoom);
    // Alt held as you let go keeps the lasso open: each Alt+click adds a straight side.
    if (e.alt) {
      s.open = true;
      g = s;
      ctx.requestOverlay();
      return;
    }
    return finishLasso(s);
  }
  if (s.mode === 'marquee') {
    g = s;
    move(e, ctx);
    g = null;
    if (activeIsMerge()) pickPart(s.drawing, rectFromPoints(s.start, e));
    ctx.requestOverlay();
    return;
  }
  if (!s.moved && Math.hypot(e.x - s.start.x, e.y - s.start.y) * ctx.zoom < DRAG_PX) {
    setLive(null);
    if (s.toggleOffOnClick) setSelection(selectedIds().filter((id) => id !== s.toggleOffOnClick));
    ctx.requestOverlay();
    return;
  }
  const m = gestureMatrix(s, ctx.zoom);
  clearSnap();
  const label = s.mode === 'move' ? 'Move' : s.mode === 'scale' ? 'Resize' : 'Rotate';
  const { result: r, ids } = landMatrix(label, { drawing: s.drawing, originals: s.originals }, m);
  if (activeIsMerge()) {
    // Lands the merge way: joins its colour and cuts others where it ends up.
    setCut(null);
    setLive(null);
    if (r === 'ok') setSelection(ids ?? []);
    else if (r !== 'nothing') reportEdit(ctx, r);
    ctx.requestOverlay();
    return;
  }
  setLive(null);
  if (r !== 'nothing') reportEdit(ctx, r);
  ctx.requestOverlay();
}

/** Closes a lasso and selects what it touches (on a merge layer, cuts out exactly what's inside it). */
function finishLasso(s: Gesture): void {
  g = null;
  const pts = (s.mag ? s.mag.outline() : s.lasso) ?? [];
  const area = pts.length >= 3 ? polygonGeom(pts) : [];
  if (!area.length) {
    requestOverlay();
    return;
  }
  const shapes = s.drawing.shapes;
  const hits = withGroups(shapes, shapes.filter((x) => shapeTouchesArea(x, area)).map((x) => x.id));
  const ids = new Set([...s.base, ...hits]);
  setSelection(shapes.filter((x) => ids.has(x.id)).map((x) => x.id));
  if (activeIsMerge()) pickPartIn(s.drawing, area, (x) => shapeInsideArea(x, area));
  requestOverlay();
}

/** True while a lasso or polygon is waiting for its next corner. */
export const lassoIsOpen = (): boolean => !!g?.open;

/** Lets go of a lasso or polygon left open, without picking anything. True when there was one. */
export function cancelOpenLasso(): boolean {
  if (!g?.open) return false;
  g = null;
  return true;
}

/** Closes a lasso or polygon left open and picks what it covers. True when there was one. */
export function closeOpenLasso(): boolean {
  if (!g?.open || !g.lasso) return false;
  finishLasso(g);
  return true;
}

function cancel(ctx: ToolContext): void {
  clearSnap();
  if (g?.mode === 'marquee') setSelection(g.base);
  g = null;
  setLive(null);
  ctx.requestOverlay();
}

/**
 * On a merge layer, a box that only covers part of a shape picks just that part. Nothing is cut yet: the cut waits
 * (see pendingCut) until the part is moved or changed.
 */
function pickPart(d: VectorDrawing, r: Rect): void {
  setCut(null);
  if (r.w < 1 || r.h < 1) return;
  const area = polygonGeom([
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x + r.w, y: r.y + r.h },
    { x: r.x, y: r.y + r.h },
  ]);
  const inside = (b: ReturnType<typeof shapeBox>) => !!b && b.x0 >= r.x && b.y0 >= r.y && b.x1 <= r.x + r.w && b.y1 <= r.y + r.h;
  pickPartIn(d, area, (s) => inside(shapeBox(s)));
}

/** pickPart for any area (a box or a lasso). `inside` says whether a shape lies wholly in it. */
function pickPartIn(d: VectorDrawing, area: Geom, inside: (s: Shape) => boolean): void {
  setCut(null);
  const ids = selectedIds();
  if (!ids.length || !area.length) return;
  const sel = new Set(ids);
  // Only worth it when some loose shape pokes out of the area.
  if (!d.shapes.some((s) => sel.has(s.id) && mergeable(s) && !inside(s))) return;
  const c = cutOut(d.shapes, sel, area);
  const lifted = new Set(c.lifted);
  const pieces = c.shapes.filter((s) => lifted.has(s.id));
  if (!pieces.length) {
    setSelection([]);
    return;
  }
  // The selection names the shapes the part comes from, so it still reads right everywhere else.
  setCut({ drawingId: d.id, from: d.shapes, selection: selectedIds(), shapes: c.shapes, lifted: pieces });
}

const RESIZE_CURSOR: Record<HandleId, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', rotate: 'grab' };

function hover(e: ToolPointer, ctx: ToolContext): void {
  if (g?.open) {
    g.cur = e;
    if (g.mag) g.mag.move(e, reachOf(ctx), ctx.zoom);
    return setCursor('crosshair');
  }
  const d = vectorDrawing();
  if (!d) return setCursor(null);
  const cut = pendingCut();
  const sel = cut ? cut.lifted : selectedOn(d);
  const b = shapesBounds(sel);
  const h = b ? hitHandle(b, e.x, e.y, ctx.zoom) : null;
  if (h) return setCursor(RESIZE_CURSOR[h]);
  setCursor(topShapeAt(cut ? cut.lifted : d.shapes, e.x, e.y, HIT_TOL / ctx.zoom) || topShapeAt(d.shapes, e.x, e.y, HIT_TOL / ctx.zoom) ? 'move' : null);
}

function overlay(gx: CanvasRenderingContext2D, ctx: ToolContext): void {
  const px = 1 / ctx.zoom;
  const ink = cssVar('--grape', '#9b7bff');
  if (g?.lasso) {
    // The magnetic lasso shows the stretch along the outline it is clinging to, where the others show a straight line.
    const rubber = g.open ? (g.mag ? (g.mag.target ? g.mag.tail : [g.cur]) : g.cur) : null;
    drawLasso(gx, g.lasso, rubber, ctx.zoom, ink, g.mag?.target);
  }
  const marquee = g?.mode === 'marquee' && !g.lasso ? rectFromPoints(g.start, g.cur) : null;
  if (marquee) {
    gx.save();
    gx.globalAlpha = 0.14;
    gx.fillStyle = ink;
    gx.fillRect(marquee.x, marquee.y, marquee.w, marquee.h);
    gx.globalAlpha = 1;
    gx.lineWidth = px;
    gx.strokeStyle = ink;
    gx.strokeRect(marquee.x, marquee.y, marquee.w, marquee.h);
    gx.restore();
  }
  const d = vectorDrawing();
  if (!d) return;
  const cut = g ? null : pendingCut();
  const sel = g && g.mode !== 'marquee' ? g.originals : cut ? cut.lifted : selectedOn(d);
  if (cut) {
    // The picked part, outlined with marching-ant dashes so it reads as "just this bit".
    gx.save();
    gx.setLineDash([4 * px, 3 * px]);
    gx.lineWidth = 1.5 * px;
    gx.strokeStyle = 'white';
    for (const s of cut.lifted) if (s.type === 'fill' || s.type === 'path') gx.stroke(subPathsToPath2D(s.paths));
    gx.lineDashOffset = 4 * px;
    gx.strokeStyle = ink;
    for (const s of cut.lifted) if (s.type === 'fill' || s.type === 'path') gx.stroke(subPathsToPath2D(s.paths));
    gx.restore();
  }
  const b = g && g.mode !== 'marquee' ? g.bounds : shapesBounds(sel);
  if (!b || !sel.length) return;
  const m = g && g.mode !== 'marquee' && g.moved ? (g.m ?? gestureMatrix(g)) : IDENTITY;

  // Each selected shape gets a thin outline of its own box, so you can see what's in.
  gx.save();
  gx.lineWidth = px;
  gx.strokeStyle = ink;
  gx.globalAlpha = 0.5;
  if (sel.length > 1) {
    for (const s of sel) {
      const sb = shapeBounds(s);
      const corners = quad(sb, m);
      polygon(gx, corners);
      gx.stroke();
    }
  }
  gx.globalAlpha = 1;
  // The box round the lot, in white then ink so it reads on any artwork.
  const box = quad(inflateRect(b, 0), m);
  gx.lineWidth = 3 * px;
  gx.strokeStyle = 'rgb(255 255 255 / 0.8)';
  polygon(gx, box);
  gx.stroke();
  gx.lineWidth = 1.25 * px;
  gx.strokeStyle = ink;
  polygon(gx, box);
  gx.stroke();

  // Handles: four corners and the round one on a stem.
  const hp = handlePoints(b, ctx.zoom);
  const top = apply(m, hp.rotate.x, b.y);
  const rot = apply(m, hp.rotate.x, hp.rotate.y);
  gx.beginPath();
  gx.moveTo(top.x, top.y);
  gx.lineTo(rot.x, rot.y);
  gx.stroke();
  const size = 8 * px;
  for (const id of ['nw', 'ne', 'se', 'sw'] as const) {
    const p = apply(m, hp[id].x, hp[id].y);
    gx.beginPath();
    gx.rect(p.x - size / 2, p.y - size / 2, size, size);
    gx.fillStyle = 'white';
    gx.fill();
    gx.lineWidth = 1.5 * px;
    gx.strokeStyle = ink;
    gx.stroke();
  }
  gx.beginPath();
  gx.arc(rot.x, rot.y, 5 * px, 0, Math.PI * 2);
  gx.fillStyle = 'white';
  gx.fill();
  gx.stroke();
  gx.restore();
}

function quad(b: Rect, m: Matrix): Pt[] {
  return [apply(m, b.x, b.y), apply(m, b.x + b.w, b.y), apply(m, b.x + b.w, b.y + b.h), apply(m, b.x, b.y + b.h)];
}

function polygon(gx: CanvasRenderingContext2D, pts: Pt[]): void {
  gx.beginPath();
  gx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) gx.lineTo(pts[i].x, pts[i].y);
  gx.closePath();
}

/** Takes the last corner of an open polygon or magnetic lasso back. At the first one, it lets go of the whole thing. */
function backOpenLasso(ctx: ToolContext): boolean {
  if (!g?.open || !g.poly || !g.lasso) return false;
  if (g.mag) {
    if (!g.mag.back()) g = null;
    else g.mag.move(g.cur, reachOf(ctx), ctx.zoom);
  } else if (g.lasso.length > 1) g.lasso.pop();
  else g = null;
  return true;
}

/** Enter closes a polygon or lasso you left open, so you don't have to land back on the first corner. Backspace takes a corner back. */
function polygonKey(e: KeyboardEvent, ctx: ToolContext): boolean {
  if (e.key === 'Backspace') return backOpenLasso(ctx);
  if (e.key !== 'Enter' || !g?.open) return false;
  return closeOpenLasso();
}

/** One tool per way of picking on a vector layer. The magic wand has no meaning here, so it is left out. */
export const selectTools: Tool[] = WAYS.filter((w) => w.vector).map((w) => ({
  id: w.vector as string,
  group: 'select',
  groupAt: w.at,
  slot: `select.${w.mode}`,
  label: w.label,
  icon: w.icon,
  key: w.key,
  layers: ['vector'] as Tool['layers'],
  order: 5 + w.at,
  help: 'tool-select',
  cursor: 'default',
  options: SelectOptions,
  down,
  move,
  up,
  hover,
  cancel,
  overlay,
  onKey: polygonKey,
}));

export const selectTool = selectTools[0];

for (const t of selectTools) registerTool(t);
