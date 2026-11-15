/**
 * The soft paint tools, on pixel layers only: Airbrush, Soft brush, Soft eraser, Highlighter and Smudge. Illustrator has no
 * soft brushes, so vector shapes never carry a soft edge; on a pixel layer a soft edge is just pixels.
 * Each is one tool made from the same stroke (see stroke.ts). A palette-locked layer, or Pixel perfect with the answer
 * "keep crisp", dithers the soft edge into colours already there instead of making see-through ones.
 */
import { parseHex } from '../canvas/colors';
import { getHover } from '../canvas/controller';
import { rememberedChoice, currentChoice } from '../core/choices';
import { registerTool, type Tool, type ToolContext, type ToolPointer } from '../core/registry';
import { store } from '../core/store';
import { drawMirrorLines } from '../pixel/tools';
import { flowFactor, sizeFactor } from '../tablet/dynamics';
import { drawRing } from '../tools/cursors';
import { activeLayer, EDIT_HINTS } from '../tools/edit';
import { PixelSession } from '../tools/pixelSession';
import { noteColorUsed } from '../tools/recent';
import { getToolSettings } from '../tools/settings';
import { reportEdit } from '../tools/util';
import { viewSizeFactor } from '../tools/view-size';
import { edgeFor, KIND_INFO, type SoftKind } from './maths';
import { SoftOptionsFor } from './Options';
import { SOFT_EDGE_CHOICE } from './choices';
import { getSoft } from './settings';
import { SmudgeStroke, SoftStroke } from './stroke';

interface Spec {
  kind: SoftKind;
  key?: string;
  group: string;
  groupAt: number;
  order: number;
  icon: string;
  help: string;
  undo: string;
  /** Lays paint down in the Paint colour. */
  paints: boolean;
  /** One line for the hint when it cannot be used. */
  what: string;
}

/** How the tools are built, in rail order. */
export const SOFT_SPECS: Spec[] = [
  { kind: 'soft-brush', key: 'Shift+F', group: 'extras', groupAt: 6, order: 27, icon: 'soft-brush', help: 'soft-paint', undo: 'Paint softly', paints: true, what: 'The soft brush' },
  { kind: 'airbrush', key: 'Alt+Shift+A', group: 'extras', groupAt: 7, order: 28, icon: 'airbrush', help: 'soft-paint', undo: 'Airbrush', paints: true, what: 'The airbrush' },
  { kind: 'highlighter', key: 'Shift+J', group: 'extras', groupAt: 8, order: 29, icon: 'highlighter', help: 'soft-paint', undo: 'Highlight', paints: true, what: 'The highlighter' },
  { kind: 'soft-eraser', key: 'Alt+Shift+R', group: 'extras', groupAt: 9, order: 30, icon: 'soft-eraser', help: 'soft-paint', undo: 'Rub out softly', paints: false, what: 'The soft eraser' },
  { kind: 'smudge', key: 'Shift+Z', group: 'extras', groupAt: 10, order: 31, icon: 'smudge', help: 'soft-paint', undo: 'Smudge', paints: false, what: 'Smudge' },
];

/** How often a held airbrush adds paint, in milliseconds. */
const HOLD_EVERY = 60;

/** The width to paint with, in art pixels, for the pointer (pen pressure and tilt change it). */
function widthFor(kind: SoftKind, e: ToolPointer): number {
  return Math.max(1, getSoft().tools[kind].size * sizeFactor(kind, e) * viewSizeFactor());
}
const strengthFor = (kind: SoftKind, e: ToolPointer): number => Math.min(1, getSoft().tools[kind].flow * flowFactor(kind, e));

/** True when this layer only holds colours from its palette. */
export const layerLocked = (layer: { paletteLock?: boolean }): boolean => !!layer.paletteLock;

/** How the soft edge is made on a layer right now (see edgeFor). */
export function edgeOn(layer: { paletteLock?: boolean }) {
  return edgeFor({ locked: layerLocked(layer), pixelPerfect: getToolSettings().pixelPerfect, crispAnswer: currentChoice<'crisp' | 'smooth'>(SOFT_EDGE_CHOICE) });
}

function softTool(spec: Spec): Tool {
  const kind = spec.kind;
  let soft: SoftStroke | null = null;
  let smudge: SmudgeStroke | null = null;
  let session: PixelSession | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let held: { width: number; strength: number } = { width: 1, strength: 0 };
  let colour = '';
  let pointer: ToolPointer | null = null;

  const stopHold = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const at = (e: ToolPointer, ps: number) => ({ x: e.x / ps, y: e.y / ps });
  const go = (e: ToolPointer, ps: number) => {
    if (!session) return;
    const width = widthFor(kind, e);
    const strength = strengthFor(kind, e);
    held = { width, strength };
    if (soft) soft.moveTo(at(e, ps), width, strength);
    else smudge?.moveTo(at(e, ps), width, strength);
    session.flush();
  };
  const finish = () => {
    stopHold();
    const s = session;
    session = null;
    soft = null;
    smudge = null;
    pointer = null;
    return s;
  };

  return {
    id: kind,
    group: spec.group,
    groupAt: spec.groupAt,
    label: KIND_INFO[kind].label,
    icon: spec.icon,
    key: spec.key,
    layers: ['pixel'],
    order: spec.order,
    help: spec.help,
    cursor: 'crosshair',
    options: SoftOptionsFor(kind),
    down(e, ctx) {
      const { layer, problem } = activeLayer();
      if (problem) return ctx.hint(EDIT_HINTS[problem]);
      if (!layer || layer.kind !== 'pixel') return ctx.hint(`${spec.what} paints soft edges, which only pixel layers can hold. Pick a pixel layer in the timeline first.`);
      const { doc, ui } = store().get();
      let rgba = parseHex(ui.color);
      if (spec.paints && !rgba) return ctx.hint("That colour isn't something I can paint with. Pick one from the Colours panel.");
      rgba ??= [0, 0, 0, 255];
      colour = ui.color;
      const edge = edgeOn(layer).mode;
      session = new PixelSession(doc, layer, ui.frame, { adds: spec.paints });
      const o = getSoft().tools[kind];
      const params = { kind, color: rgba, hardness: o.hardness, edge };
      if (kind === 'smudge') smudge = new SmudgeStroke(session, params, o.size * 2 * viewSizeFactor());
      else soft = new SoftStroke(session, doc, layer, params);
      pointer = e;
      go(e, layer.pixelSize);
      if (kind === 'airbrush' && getSoft().holdBuilds) {
        timer = setInterval(() => {
          if (soft && pointer) {
            soft.hold(held.width, held.strength);
            session?.flush();
          }
        }, HOLD_EVERY);
      }
    },
    move(e) {
      if (!session) return;
      pointer = e;
      go(e, session.pixelSize);
    },
    up(e, ctx) {
      if (session) go(e, session.pixelSize);
      const s = finish();
      if (!s) return;
      const r = s.commit(spec.undo);
      if (r === 'ok') {
        if (spec.paints && colour) noteColorUsed(colour);
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
      // Smudge ignores mirror drawing, so it shows no mirror lines.
      if (kind !== 'smudge') drawMirrorLines(g, ctx);
      if (session) return;
      const h = getHover();
      const { layer } = activeLayer();
      if (!h || !layer || layer.kind !== 'pixel') return;
      drawRing(g, ctx, h.x, h.y, (getSoft().tools[kind].size * viewSizeFactor() * layer.pixelSize) / 2, kind);
    },
  };
}

for (const spec of SOFT_SPECS) registerTool(softTool(spec));

/** Whether the person has already answered the Pixel perfect question (so the soft tools know whether to ask). */
export const edgeAnswered = (): boolean => rememberedChoice(SOFT_EDGE_CHOICE) !== undefined;
