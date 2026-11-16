/**
 * The retouch brushes, on pixel layers: the Clone stamp, the Blur brush and the Sharpen brush. Each is a dab brush from
 * src/dab (tip, spacing, hardness, flow, pen dynamics), with one difference: instead of a flat colour, every pixel a dab
 * reaches is moved toward a colour worked out from the picture as it was before the stroke (picks.ts). One stroke is one undo step.
 */
import { getHover } from '../canvas/controller';
import { currentChoice, withChoice } from '../core/choices';
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { dabEdge } from '../dab/tools';
import { drawDabCursor } from '../dab/cursor';
import { sessionStroke, sessionSurface, type DabStroke } from '../dab/stroke';
import { senseOf, SpeedMeter } from '../dab/sense';
import { drawMirrorLines } from '../pixel/tools';
import { activeLayer, EDIT_HINTS } from '../tools/edit';
import { PixelSession } from '../tools/pixelSession';
import { reportEdit } from '../tools/util';
import { viewSizeFactor } from '../tools/view-size';
import { toast } from '../ui/toast';
import { CLONE_ALIGN_CHOICE, type CloneAlign } from './choices';
import { cloneAim, setCloneSource, setCloneOffset } from './aim';
import { previewSpot, strokeOffset, type Pt, type Reader } from './maths';
import { blurPick, clonePick, sharpenPick } from './picks';
import { RetouchOptionsFor } from './Options';
import { retouchStore, type RetouchKind } from './settings';
import { readerOf, visibleSnapshot } from './source';

export const CLONE_TOOL = 'clone-stamp';
export const BLUR_TOOL = 'blur-brush';
export const SHARPEN_TOOL = 'sharpen-brush';

interface Spec {
  kind: RetouchKind;
  id: string;
  label: string;
  commandLabel: string;
  key: string;
  icon: string;
  groupAt: number;
  order: number;
  help: string;
  undo: string;
  what: string;
}

export const RETOUCH_SPECS: Spec[] = [
  { kind: 'clone', id: CLONE_TOOL, label: 'Clone stamp', commandLabel: 'Copy part of the picture as you paint (Clone stamp)', key: 'Alt+Shift+S', icon: 'clone-stamp', groupAt: 13, order: 34, help: 'clone-stamp', undo: 'Clone', what: 'The clone stamp' },
  { kind: 'blur', id: BLUR_TOOL, label: 'Blur brush', commandLabel: 'Soften the picture with a brush (Blur brush)', key: 'Alt+Shift+U', icon: 'blur-brush', groupAt: 14, order: 35, help: 'blur-sharpen-brush', undo: 'Blur', what: 'The blur brush' },
  { kind: 'sharpen', id: SHARPEN_TOOL, label: 'Sharpen brush', commandLabel: 'Crisp up the picture with a brush (Sharpen brush)', key: 'Alt+Shift+Y', icon: 'sharpen-brush', groupAt: 15, order: 36, help: 'blur-sharpen-brush', undo: 'Sharpen', what: 'The sharpen brush' },
];

const isAligned = (): boolean => currentChoice<CloneAlign>(CLONE_ALIGN_CHOICE) === 'aligned';

// ---------------------------------------------------------------- one tool, made three ways

function retouchTool(spec: Spec): Tool {
  const kind = spec.kind;
  const settings = retouchStore(kind);
  let stroke: DabStroke | null = null;
  let session: PixelSession | null = null;
  let meter = new SpeedMeter();
  let offset: Pt | null = null;
  let last: Pt | null = null;
  const finish = () => {
    const s = session;
    session = null;
    stroke = null;
    offset = null;
    last = null;
    return s;
  };
  const widthFor = (): number => Math.max(1, settings.get().brush.size * viewSizeFactor());
  const flowFor = (): number => Math.min(1, settings.get().brush.flow);
  const go = (e: ToolPointer, ps: number) => {
    if (!session || !stroke) return;
    last = { x: e.x / ps, y: e.y / ps };
    stroke.moveTo(last, widthFor(), flowFor(), senseOf(e, meter.push(last.x, last.y, e.time)));
    session.flush();
  };

  return {
    id: spec.id,
    group: 'extras',
    groupAt: spec.groupAt,
    label: spec.label,
    commandLabel: spec.commandLabel,
    icon: spec.icon,
    key: spec.key,
    layers: ['pixel'],
    order: spec.order,
    help: spec.help,
    cursor: 'crosshair',
    options: RetouchOptionsFor(kind),
    down(e, ctx) {
      const { layer, problem } = activeLayer();
      if (problem) return ctx.hint(EDIT_HINTS[problem]);
      if (!layer || layer.kind !== 'pixel') return ctx.hint(`${spec.what} works on pixels, so it needs a pixel layer. Pick one in the timeline first.`);
      const ps = layer.pixelSize;
      const at = { x: e.x / ps, y: e.y / ps };
      if (kind === 'clone') {
        // Alt-click (or Ctrl-click) chooses where to copy from. With nothing chosen yet, the first click does.
        if (e.alt || e.mod || !cloneAim().source) {
          setCloneSource(at);
          toast(e.alt || e.mod ? 'Copying from here. Now paint where you want the copy.' : 'Copying from here. Now paint where you want the copy. Alt-click picks a new spot.', { duration: 2600 });
          ctx.requestOverlay();
          return;
        }
        offset = strokeOffset(cloneAim(), at, isAligned());
        if (!offset) return;
      }
      const { doc, ui } = store().get();
      const brush = settings.get().brush;
      session = new PixelSession(doc, layer, ui.frame, { adds: true });
      meter = new SpeedMeter();
      const surface = sessionSurface(session);
      let pick;
      if (kind === 'clone') {
        let source: Reader = (x, y, out) => surface.read(x, y, out);
        if (settings.get().sample === 'visible') {
          const snap = visibleSnapshot(doc, layer, ui.frame);
          if (snap) source = readerOf(snap);
        }
        pick = clonePick(source, offset!);
      } else if (kind === 'blur') pick = blurPick(surface, settings.get().amount);
      else pick = sharpenPick(surface, settings.get().amount);
      stroke = sessionStroke(session, doc, layer, { brush, color: [0, 0, 0, 255], edge: dabEdge(brush.aliased, layer).mode, pick });
      go(e, ps);
    },
    move(e) {
      if (session) go(e, session.pixelSize);
    },
    up(e, ctx) {
      if (session) {
        go(e, session.pixelSize);
        stroke?.finish();
        session.flush();
      }
      const keep = offset;
      const s = finish();
      if (!s) return;
      const r = s.commit(spec.undo);
      if (r !== 'nothing' && r !== 'ok') reportEdit(ctx, r);
      if (r === 'ok' && kind === 'clone' && keep) {
        // The first stroke is over and the hand is off the pen: the moment to ask what happens next time (once, then remembered).
        if (setCloneOffset(keep) === 1) withChoice(CLONE_ALIGN_CHOICE, () => undefined);
      }
      ctx.requestOverlay();
    },
    cancel(ctx: ToolContext) {
      finish()?.discard();
      ctx.requestOverlay();
    },
    leave() {
      finish()?.discard();
    },
    overlay(g, ctx) {
      drawMirrorLines(g, ctx);
      const { layer } = activeLayer();
      if (!layer || layer.kind !== 'pixel') return;
      const ps = layer.pixelSize;
      const h = getHover();
      const brush = settings.get().brush;
      const size = Math.max(1, brush.size * viewSizeFactor());
      if (kind === 'clone') drawSource(g, ctx, ps, size, session && last && offset ? { x: last.x + offset.x, y: last.y + offset.y } : h ? previewSpot(cloneAim(), { x: h.x / ps, y: h.y / ps }, isAligned()) : null);
      if (session || !h) return;
      drawDabCursor(g, ctx, h.x, h.y, ps, brush, size);
    },
  };
}

/** The spot being copied from: a ring the size of the brush where the copy is coming from now, and a cross on the spot you chose. */
function drawSource(g: CanvasRenderingContext2D, ctx: ToolContext, ps: number, size: number, now: Pt | null): void {
  const px = 1 / ctx.zoom;
  const both = (path: () => void) => {
    g.lineWidth = 3 * px;
    g.strokeStyle = 'rgb(255 255 255 / 0.8)';
    path();
    g.stroke();
    g.lineWidth = px;
    g.strokeStyle = 'rgb(0 0 0 / 0.85)';
    path();
    g.stroke();
  };
  g.save();
  const source = cloneAim().source;
  if (source) {
    const cx = (source.x + 0.5) * ps;
    const cy = (source.y + 0.5) * ps;
    const arm = Math.max(5 * px, 1.5 * ps);
    both(() => {
      g.beginPath();
      g.moveTo(cx - arm, cy);
      g.lineTo(cx + arm, cy);
      g.moveTo(cx, cy - arm);
      g.lineTo(cx, cy + arm);
    });
  }
  if (now) {
    const r = Math.max(2 * px, (size * ps) / 2);
    both(() => {
      g.beginPath();
      g.setLineDash([4 * px, 3 * px]);
      g.arc(now.x * ps, now.y * ps, r, 0, Math.PI * 2);
    });
  }
  g.restore();
}

for (const s of RETOUCH_SPECS) registerTool(retouchTool(s));
