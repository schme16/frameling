/**
 * Transform [Q]: a box round what is selected, with handles to move, turn, stretch, squash and slant it, on shapes,
 * symbols and selected pixels alike.
 *
 * - Drag the middle to move. Drag a corner to stretch (Shift keeps the proportions, Alt works from the pivot).
 * - Drag the middle of a side to squash one way. Hold Ctrl (Cmd) as you drag it to slant instead.
 * - Drag the round knob to turn (Shift snaps to 15 degrees). Drag the little cross to move the pivot it turns round.
 * - Enter, or clicking away, applies it. Escape puts it all back. The whole session is one undo step.
 *
 * The maths is in box.ts, the preview and landing in session.ts. The document is not touched until you apply.
 */
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { cssVar } from '../canvas/theme';
import { setCursor } from '../canvas/controller';
import { apply, shapeBounds, topShapeAt, type Pt } from '../canvas/geometry';
import { clearSnap, snapMove, snapPt } from '../canvas/guides';
import { activeLayer } from '../tools/edit';
import { shownDrawing } from '../core/symbols';
import { withGroups } from '../tools/merge-mode';
import { setPixelSelection } from '../select/pixel-state';
import { TransformOptions } from './Options';
import { angleFromPivot, arrowStep, corners, hitBox, moveBox, movePivot, pivotPoint, rotateKnob, skewBox, stretchBox, turnBox, type BoxHit, type EdgeHandle, type Frame } from './box';
import { begin, cancel, commit, currentFrame, getSession, isDirty, sayWith, setFrame, whyNot } from './session';
import { skewKey, wantsSkew } from './settings';
import type { Id } from '../core/format';

/** A drag shorter than this (screen pixels) is still a click. */
const DRAG_PX = 3;
const HIT_TOL = 5;

interface Drag {
  hit: BoxHit;
  f0: Frame;
  start: Pt;
  startAngle: number;
  moved: boolean;
}
let drag: Drag | null = null;

const isPixel = (): boolean => activeLayer().layer?.kind === 'pixel';

/** Tells the person what applying did when it could not be exact. */
function told(ctx: ToolContext, lossy: boolean): void {
  if (lossy) ctx.hint('Pixels were picked again to fit, so this is not exactly what you had. Ctrl+Z puts them back.');
}

/** Applies what is open (a click away, Enter, another tool). */
function land(ctx: ToolContext): boolean {
  sayWith((m) => ctx.hint(m));
  const r = commit();
  told(ctx, r.lossy);
  return r.ok;
}

function down(e: ToolPointer, ctx: ToolContext): void {
  sayWith((m) => ctx.hint(m));
  drag = null;
  const { layer } = activeLayer();
  if (!layer || (layer.kind !== 'vector' && layer.kind !== 'pixel')) return ctx.hint('Transform works on vector and pixel layers. Pick one in the timeline first.');
  const f = currentFrame();
  const hit = f ? hitBox(f, e.x, e.y, ctx.zoom) : null;
  if (f && hit) {
    const reason = whyNot();
    if (reason) return ctx.hint(reason);
    const s = begin();
    if (!s) return;
    drag = { hit, f0: s.f, start: { x: e.x, y: e.y }, startAngle: hit === 'rotate' ? angleFromPivot(s.f, e) : 0, moved: false };
    return;
  }
  // Away from the box: what is open lands first, then the click works as it does anywhere.
  if (isDirty()) land(ctx);
  else cancel();
  if (layer.kind === 'pixel') {
    if (!e.shift) setPixelSelection(null);
    if (!f) ctx.hint('Select some pixels first (the Select tool), then transform them.');
    return;
  }
  const d = vectorDrawing();
  if (!d) return;
  const hitShape = topShapeAt(d.shapes, e.x, e.y, HIT_TOL / ctx.zoom);
  if (!hitShape) {
    if (!e.shift) store().setUi({ selection: [] });
    if (!f) ctx.hint('Click a shape to transform it. To pick several, use Select first, or hold Shift and click each.');
    return;
  }
  const ids = new Set<Id>(e.shift ? store().get().ui.selection : []);
  const family = withGroups(d.shapes, [hitShape.id]);
  const had = ids.has(hitShape.id);
  for (const id of family) (e.shift && had ? ids.delete(id) : ids.add(id));
  store().setUi({ selection: d.shapes.filter((x) => ids.has(x.id)).map((x) => x.id) });
  // A click on a shape also picks it up, so one press moves it.
  if (!(e.shift && had)) {
    const s = begin();
    if (s) drag = { hit: 'move', f0: s.f, start: { x: e.x, y: e.y }, startAngle: 0, moved: false };
  }
}

function vectorDrawing() {
  const { layer } = activeLayer();
  const { doc, ui } = store().get();
  if (!layer || layer.kind !== 'vector') return undefined;
  const d = shownDrawing(doc, layer, ui.frame);
  return d && d.kind === 'vector' ? d : undefined;
}

/** The box of the frame, as a plain rectangle (for snapping a move to guides). */
function boundsOf(f: Frame) {
  const q = corners(f);
  const xs = q.map((p) => p.x);
  const ys = q.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function move(e: ToolPointer, ctx: ToolContext): void {
  const d = drag;
  const s = getSession();
  if (!d || !s) return;
  if (!d.moved) {
    if (Math.hypot(e.x - d.start.x, e.y - d.start.y) * ctx.zoom < DRAG_PX) return;
    d.moved = true;
  }
  const pixel = s.kind === 'pixel';
  const size = s.px?.size ?? 1;
  const skewing = wantsSkew(e);
  if (d.hit === 'move') {
    let dx = e.x - d.start.x;
    let dy = e.y - d.start.y;
    if (e.shift) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    if (pixel) {
      // Pixels move by whole pixels of the art, so a move never picks them again.
      dx = Math.round(dx / size) * size;
      dy = Math.round(dy / size) * size;
    } else {
      const lockX = e.shift && dx === 0;
      const lockY = e.shift && dy === 0;
      const snapped = snapMove(boundsOf(d.f0), dx, dy, ctx.zoom, e.mod);
      dx = lockX ? 0 : snapped.dx;
      dy = lockY ? 0 : snapped.dy;
    }
    setFrame({ m: moveBox(d.f0, dx, dy), pivot: s.f.pivot }, 'Move');
  } else if (d.hit === 'rotate') {
    setFrame({ m: turnBox(d.f0, d.startAngle, e, e.shift), pivot: s.f.pivot }, 'Turn');
  } else if (d.hit === 'pivot') {
    setFrame({ m: s.f.m, pivot: movePivot(d.f0, e, ctx.zoom, !e.alt) });
  } else if (d.hit.length === 1 && skewing) {
    const snap = skewKey() === 'ctrl' && e.shift;
    setFrame({ m: skewBox(d.f0, d.hit as EdgeHandle, e, { alt: e.alt, snap }), pivot: s.f.pivot }, 'Slant');
  } else {
    // Corners and sides pull on guides and the page, like Select does.
    const p = pixel ? e : snapPt(e, ctx.zoom, e.mod, true);
    const shift = d.hit.length === 1 && skewKey() === 'shift' ? false : e.shift;
    setFrame({ m: stretchBox(d.f0, d.hit as Exclude<BoxHit, 'rotate' | 'pivot' | 'move'>, p, { shift, alt: e.alt }), pivot: s.f.pivot }, 'Resize');
  }
}

function up(e: ToolPointer, ctx: ToolContext): void {
  const d = drag;
  if (d && !d.moved && getSession() && !isDirty()) {
    // A click that went nowhere: nothing was changed, so nothing stays open.
    if (d.hit !== 'pivot') cancel();
  } else if (d?.moved) move(e, ctx);
  drag = null;
  clearSnap();
  ctx.requestOverlay();
}

function cancelDrag(ctx: ToolContext): void {
  drag = null;
  clearSnap();
  cancel();
  ctx.requestOverlay();
}

/** The arrow keys nudge the box (a pixel, ten with Shift; on pixels, a whole art pixel), so a nudge joins the session. */
function onKey(e: KeyboardEvent, ctx: ToolContext): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const s = getSession();
  if (e.key === 'Enter') {
    if (!s || !isDirty()) return false;
    land(ctx);
    return true;
  }
  if (e.key === 'Escape') {
    if (!s || !isDirty()) return false;
    cancel();
    ctx.hint('Put back as it was.');
    return true;
  }
  const arrow = arrowStep(e.key);
  if (!arrow) return false;
  const reason = whyNot();
  if (reason) return false;
  const live = begin();
  if (!live) return false;
  const step = (e.shiftKey ? 10 : 1) * (live.px?.size ?? 1);
  setFrame({ m: moveBox(live.f, arrow.dx * step, arrow.dy * step), pivot: live.f.pivot }, 'Move');
  return true;
}

// ---------------------------------------------------------------- cursor

/** Which two-headed arrow a handle gets, from the way it points on screen (a turned box turns its arrows). */
function arrowFor(f: Frame, h: Exclude<BoxHit, 'rotate' | 'pivot' | 'move'>, skewing: boolean): string {
  const c = pivotPoint({ ...f, pivot: { x: f.r0.x + f.r0.w / 2, y: f.r0.y + f.r0.h / 2 } });
  const L = { nw: [f.r0.x, f.r0.y], n: [f.r0.x + f.r0.w / 2, f.r0.y], ne: [f.r0.x + f.r0.w, f.r0.y], e: [f.r0.x + f.r0.w, f.r0.y + f.r0.h / 2], se: [f.r0.x + f.r0.w, f.r0.y + f.r0.h], s: [f.r0.x + f.r0.w / 2, f.r0.y + f.r0.h], sw: [f.r0.x, f.r0.y + f.r0.h], w: [f.r0.x, f.r0.y + f.r0.h / 2] }[h];
  const p = apply(f.m, L[0], L[1]);
  let a = Math.atan2(p.y - c.y, p.x - c.x);
  // A slant moves along the side, so its arrow points that way, a quarter turn from the squash arrow.
  if (skewing) a += Math.PI / 2;
  const deg = ((a * 180) / Math.PI + 360) % 180;
  if (deg < 22.5 || deg >= 157.5) return 'ew-resize';
  if (deg < 67.5) return 'nwse-resize';
  if (deg < 112.5) return 'ns-resize';
  return 'nesw-resize';
}

function hover(e: ToolPointer, ctx: ToolContext): void {
  const f = currentFrame();
  if (!f) {
    const d = vectorDrawing();
    return setCursor(d && topShapeAt(d.shapes, e.x, e.y, HIT_TOL / ctx.zoom) ? 'pointer' : null);
  }
  const h = hitBox(f, e.x, e.y, ctx.zoom);
  if (!h) return setCursor(null);
  if (h === 'rotate') return setCursor('grab');
  if (h === 'pivot') return setCursor('crosshair');
  if (h === 'move') return setCursor('move');
  setCursor(arrowFor(f, h, h.length === 1 && wantsSkew(e)));
}

// ---------------------------------------------------------------- drawing the box

function overlay(gx: CanvasRenderingContext2D, ctx: ToolContext): void {
  const f = currentFrame();
  if (!f) return;
  const px = 1 / ctx.zoom;
  const ink = cssVar('--grape', '#9b7bff');
  const q = corners(f);
  const s = getSession();
  gx.save();
  // Several shapes each get a thin box of their own, so you can see what is in.
  if (s?.kind === 'vector' || !s) {
    const { layer } = activeLayer();
    const d = vectorDrawing();
    const sel = new Set(store().get().ui.selection);
    const picked = layer?.kind === 'vector' && d ? (s?.target?.originals ?? d.shapes.filter((x) => sel.has(x.id))) : [];
    if (picked.length > 1) {
      gx.lineWidth = px;
      gx.strokeStyle = ink;
      gx.globalAlpha = 0.5;
      for (const sh of picked) {
        const b = shapeBounds(sh);
        poly(gx, [apply(f.m, b.x, b.y), apply(f.m, b.x + b.w, b.y), apply(f.m, b.x + b.w, b.y + b.h), apply(f.m, b.x, b.y + b.h)]);
        gx.stroke();
      }
      gx.globalAlpha = 1;
    }
  }
  // The box, in white then ink so it reads on any art.
  gx.lineWidth = 3 * px;
  gx.strokeStyle = 'rgb(255 255 255 / 0.8)';
  poly(gx, q);
  gx.stroke();
  gx.lineWidth = 1.25 * px;
  gx.strokeStyle = ink;
  poly(gx, q);
  gx.stroke();
  // Handles: four corners, four sides, the turn knob on its stem, and the pivot.
  const { stem, knob } = rotateKnob(f, ctx.zoom);
  gx.beginPath();
  gx.moveTo(stem.x, stem.y);
  gx.lineTo(knob.x, knob.y);
  gx.stroke();
  const size = 8 * px;
  const mids = [apply(f.m, f.r0.x + f.r0.w / 2, f.r0.y), apply(f.m, f.r0.x + f.r0.w, f.r0.y + f.r0.h / 2), apply(f.m, f.r0.x + f.r0.w / 2, f.r0.y + f.r0.h), apply(f.m, f.r0.x, f.r0.y + f.r0.h / 2)];
  gx.fillStyle = 'white';
  gx.lineWidth = 1.5 * px;
  for (const p of q) square(gx, p, size);
  const side = 6 * px;
  for (const p of mids) square(gx, p, side);
  gx.beginPath();
  gx.arc(knob.x, knob.y, 5 * px, 0, Math.PI * 2);
  gx.fill();
  gx.stroke();
  // The pivot: a ring with a dot, so it does not look like a handle.
  const pv = pivotPoint(f);
  gx.beginPath();
  gx.arc(pv.x, pv.y, 5 * px, 0, Math.PI * 2);
  gx.fillStyle = 'rgb(255 255 255 / 0.9)';
  gx.fill();
  gx.stroke();
  gx.beginPath();
  gx.arc(pv.x, pv.y, 1.6 * px, 0, Math.PI * 2);
  gx.fillStyle = ink;
  gx.fill();
  gx.restore();
}

function square(gx: CanvasRenderingContext2D, p: Pt, size: number): void {
  gx.beginPath();
  gx.rect(p.x - size / 2, p.y - size / 2, size, size);
  gx.fill();
  gx.stroke();
}

function poly(gx: CanvasRenderingContext2D, pts: Pt[]): void {
  gx.beginPath();
  gx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) gx.lineTo(pts[i].x, pts[i].y);
  gx.closePath();
}

export const transformTool: Tool = {
  id: 'transform',
  group: 'select',
  // After the ways of picking (0 to 4) and before the Points tool.
  groupAt: 4.5,
  label: 'Transform',
  commandLabel: 'Transform (move, turn, stretch, slant)',
  icon: 'transform',
  key: 'q',
  layers: ['vector', 'pixel'],
  order: 11,
  help: 'transform',
  cursor: 'default',
  options: TransformOptions,
  down,
  move,
  up,
  hover,
  cancel: cancelDrag,
  overlay,
  onKey,
  leave: (ctx) => void land(ctx),
};

registerTool(transformTool);
