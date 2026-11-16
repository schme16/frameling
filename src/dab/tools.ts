/**
 * The Pixel brush, on pixel layers: a stroke as a row of dabs, with a round, square or picture tip, a spacing, scatter,
 * and turning with the line. Anti-aliasing is off by default (a pixel artist usually wants whole pixels); with it on, the
 * edge is see-through, unless the layer keeps to its palette or Pixel perfect says keep it crisp, and then it dithers.
 */
import { parseHex } from '../canvas/colors';
import { getHover } from '../canvas/controller';
import { currentChoice } from '../core/choices';
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { drawMirrorLines } from '../pixel/tools';
import { SOFT_EDGE_CHOICE } from '../soft/choices';
import { edgeFor, type EdgeMode } from '../soft/maths';
import { flowFactor, sizeFactor } from '../tablet/dynamics';
import { drivesFrom } from './dynamics';
import { senseOf, SpeedMeter } from './sense';
import { activeLayer, EDIT_HINTS } from '../tools/edit';
import { PixelSession } from '../tools/pixelSession';
import { noteColorUsed } from '../tools/recent';
import { getToolSettings } from '../tools/settings';
import { reportEdit } from '../tools/util';
import { viewSizeFactor } from '../tools/view-size';
import { DabOptionsPanel } from './Options';
import { getDry } from '../dry/settings';
import { getDab } from './settings';
import { sessionStroke, type DabStroke } from './stroke';
import { PIXEL_BRUSH_TOOL } from './live';
import { drawDabCursor } from './cursor';

/** The width to paint with, in art pixels, for the pointer (pen pressure and tilt change it when the pen page says so). */
const widthFor = (e: ToolPointer): number => Math.max(1, getDab().size * sizeFor(e) * viewSizeFactor());
// A brush that sends the pen to its size (or flow) itself does not get the Pen page's pressure on top, so it never counts twice.
const sizeFor = (e: ToolPointer): number => (drivesFrom(getDab().dynamics, 'size', ['pressure', 'tilt']) ? 1 : sizeFactor(PIXEL_BRUSH_TOOL, e));
const flowFor = (e: ToolPointer): number => Math.min(1, getDab().flow * (drivesFrom(getDab().dynamics, 'flow', ['pressure', 'tilt']) ? 1 : flowFactor(PIXEL_BRUSH_TOOL as never, e)));

/**
 * How the edge is made on a layer right now. An aliased brush is always crisp. An anti-aliased one is smooth, unless the
 * layer's palette is locked (then it dithers), or Pixel perfect is on and the remembered answer says keep it crisp.
 */
export function dabEdge(aliased: boolean, layer: { paletteLock?: boolean }): { mode: EdgeMode; why: 'aliased' | 'locked' | 'perfect' | null } {
  if (aliased) return { mode: 'crisp', why: 'aliased' };
  return edgeFor({ locked: !!layer.paletteLock, pixelPerfect: getToolSettings().pixelPerfect, crispAnswer: currentChoice<'crisp' | 'smooth'>(SOFT_EDGE_CHOICE) });
}

function dabTool(): Tool {
  let stroke: DabStroke | null = null;
  let session: PixelSession | null = null;
  let colour = '';
  let meter = new SpeedMeter();
  const finish = () => {
    const s = session;
    session = null;
    stroke = null;
    return s;
  };
  const go = (e: ToolPointer, ps: number) => {
    if (!session || !stroke) return;
    stroke.moveTo({ x: e.x / ps, y: e.y / ps }, widthFor(e), flowFor(e), senseOf(e, meter.push(e.x / ps, e.y / ps, e.time)));
    session.flush();
  };

  return {
    id: PIXEL_BRUSH_TOOL,
    group: 'extras',
    groupAt: 12,
    label: 'Pixel brush',
    commandLabel: 'Draw with the pixel brush (tips, spacing, scatter)',
    icon: 'pixel-brush',
    key: 'Alt+Shift+N',
    layers: ['pixel'],
    order: 33,
    help: 'pixel-brush',
    cursor: 'crosshair',
    options: DabOptionsPanel,
    down(e, ctx) {
      const { layer, problem } = activeLayer();
      if (problem) return ctx.hint(EDIT_HINTS[problem]);
      if (!layer || layer.kind !== 'pixel') return ctx.hint('The pixel brush paints pixels, so it needs a pixel layer. Pick one in the timeline first.');
      const { doc, ui } = store().get();
      const rgba = parseHex(ui.color);
      if (!rgba) return ctx.hint("That colour isn't something I can paint with. Pick one from the Colours panel.");
      colour = ui.color;
      const brush = getDab();
      session = new PixelSession(doc, layer, ui.frame, { adds: true });
      meter = new SpeedMeter();
      // The back colour is the Fill colour (Photoshop's background): brushes that mix colour go toward it.
      const back = (ui.fillColor && parseHex(ui.fillColor)) || null;
      stroke = sessionStroke(session, doc, layer, { brush, color: rgba, back, edge: dabEdge(brush.aliased, layer).mode, sheet: getDry().paper });
      go(e, layer.pixelSize);
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
      const s = finish();
      if (!s) return;
      const r = s.commit('Draw with the pixel brush');
      if (r === 'ok') {
        if (colour) noteColorUsed(colour);
      } else if (r !== 'nothing') reportEdit(ctx, r);
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
      if (session) return;
      const h = getHover();
      const { layer } = activeLayer();
      if (!h || !layer || layer.kind !== 'pixel') return;
      drawDabCursor(g, ctx, h.x, h.y, layer.pixelSize, getDab(), Math.max(1, getDab().size * viewSizeFactor()));
    },
  };
}

registerTool(dabTool());
