/**
 * The chalk and charcoal tool, on pixel layers: nine dry media (vine and compressed charcoal, chalk, soft and oil pastel,
 * crayon and three pencils) that catch on the paper's high points and skip the low ones. One tool with a choice of
 * medium, so the rail gets one button, and each medium keeps its own size, edge and pressure. A palette-locked layer, or
 * Pixel perfect with the answer "keep crisp", makes the grain all or nothing instead of see-through.
 */
import { parseHex } from '../canvas/colors';
import { getHover } from '../canvas/controller';
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { drawMirrorLines } from '../pixel/tools';
import { edgeOn } from '../soft/tools';
import { flowFactor, sizeFactor } from '../tablet/dynamics';
import { drawRing } from '../tools/cursors';
import { activeLayer, EDIT_HINTS } from '../tools/edit';
import { PixelSession } from '../tools/pixelSession';
import { noteColorUsed } from '../tools/recent';
import { reportEdit } from '../tools/util';
import { viewSizeFactor } from '../tools/view-size';
import { mediumInfo } from './maths';
import { DryOptionsPanel } from './Options';
import { getDry } from './settings';
import { DryStroke } from './stroke';

export const DRY_TOOL = 'charcoal';

/** The width to paint with, in art pixels, for the pointer (pen pressure and tilt change it when the pen page says so). */
const widthFor = (e: ToolPointer): number => Math.max(1, getDry().tools[getDry().medium].size * sizeFactor(DRY_TOOL, e) * viewSizeFactor());

/** How hard the stick is pressed, 0 to 1: the Pressure setting, scaled by the pen when pressure is on. */
export const pressFor = (press: number, e: Pick<ToolPointer, 'pressure' | 'hasPressure'>): number => Math.min(1, press * flowFactor(DRY_TOOL, e as ToolPointer));

function dryTool(): Tool {
  let stroke: DryStroke | null = null;
  let session: PixelSession | null = null;
  let colour = '';
  const finish = () => {
    const s = session;
    session = null;
    stroke = null;
    return s;
  };
  const go = (e: ToolPointer, ps: number) => {
    if (!session || !stroke) return;
    const o = getDry().tools[getDry().medium];
    stroke.moveTo({ x: e.x / ps, y: e.y / ps }, widthFor(e), pressFor(o.press, e));
    session.flush();
  };

  return {
    id: DRY_TOOL,
    group: 'extras',
    groupAt: 11,
    label: 'Chalk and charcoal',
    commandLabel: 'Draw with chalk, charcoal, pastel or pencil',
    icon: 'charcoal',
    key: 'Alt+Shift+T',
    layers: ['pixel'],
    order: 32,
    help: 'chalk-charcoal',
    cursor: 'crosshair',
    options: DryOptionsPanel,
    down(e, ctx) {
      const { layer, problem } = activeLayer();
      if (problem) return ctx.hint(EDIT_HINTS[problem]);
      if (!layer || layer.kind !== 'pixel') return ctx.hint('Chalk and charcoal catch on paper, which only pixel layers can hold. Pick a pixel layer in the timeline first.');
      const { doc, ui } = store().get();
      const rgba = parseHex(ui.color);
      if (!rgba) return ctx.hint("That colour isn't something I can draw with. Pick one from the Colours panel.");
      colour = ui.color;
      const d = getDry();
      const o = d.tools[d.medium];
      session = new PixelSession(doc, layer, ui.frame, { adds: true });
      stroke = new DryStroke(session, doc, layer, { medium: mediumInfo(d.medium), paper: d.paper, color: rgba, hardness: o.hardness, edge: edgeOn(layer).mode });
      go(e, layer.pixelSize);
    },
    move(e) {
      if (session) go(e, session.pixelSize);
    },
    up(e, ctx) {
      if (session) go(e, session.pixelSize);
      const s = finish();
      if (!s) return;
      const r = s.commit(`Draw with ${mediumInfo(getDry().medium).label.toLowerCase()}`);
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
      drawRing(g, ctx, h.x, h.y, (getDry().tools[getDry().medium].size * viewSizeFactor() * layer.pixelSize) / 2, DRY_TOOL);
    },
  };
}

registerTool(dryTool());
