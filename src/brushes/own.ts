// Brushes you build from your own drawing: one that goes along the line, and the edged one with a drawing for the sides,
// the two ends and the two kinds of corner. Each takes the selection as its drawing. Also turning brush lines into plain
// shapes. The shapes themselves are worked out in src/geometry/tipRibbon.ts.
import { registerChoice, withChoice } from '../core/choices';
import type { BrushTip, Shape, TipPieces } from '../core/format';
import { strokeParts } from '../core/tips';
import { store } from '../core/store';
import { tileOf } from '../geometry/tipRibbon';
import { defaultTip } from '../geometry/tip';
import { editShapes } from '../tools/merge-mode';
import { activeDrawing, activeLayer, EDIT_HINTS } from '../tools/edit';
import { pickTool } from '../tools/pick';
import { showPanel } from '../ui/dock';
import { toast } from '../ui/toast';
import { vectorStampFrom } from './stamps';
import { choiceWord } from '../words/choices';

export type AlongFit = 'stretch' | 'repeat';

registerChoice<AlongFit>({
  id: 'brush.alongFit',
  title: choiceWord('choice.brush.alongFit.title'),
  question: choiceWord('choice.brush.alongFit.question'),
  options: [
    { value: 'stretch', label: choiceWord('choice.brush.alongFit.stretch.label'), detail: choiceWord('choice.brush.alongFit.stretch.detail'), did: choiceWord('choice.brush.alongFit.stretch.did') },
    { value: 'repeat', label: choiceWord('choice.brush.alongFit.repeat.label'), detail: choiceWord('choice.brush.alongFit.repeat.detail'), did: choiceWord('choice.brush.alongFit.repeat.did') },
  ],
  default: 'stretch',
  category: 'Drawing',
  help: 'brush-own',
});

/** The parts of an edged brush you can fill from a selection, in the order the options list them. */
export const EDGED_SLOTS = [
  { id: 'sides', label: 'Sides', hint: 'The middle part, repeated along the line.' },
  { id: 'start', label: 'Start', hint: 'The drawing at the start of the line.' },
  { id: 'end', label: 'End', hint: 'The drawing at the end of the line.' },
  { id: 'inner', label: 'Inside corner', hint: 'At a corner where the line turns towards the top of the drawing.' },
  { id: 'outer', label: 'Outside corner', hint: 'At a corner where the line turns away from the top of the drawing.' },
] as const;
export type EdgedSlot = (typeof EDGED_SLOTS)[number]['id'];

const warn = (message: string): false => {
  toast(message, { kind: 'warn' });
  return false;
};

function showOptions(): void {
  pickTool('brush');
  showPanel('tool-options');
}

/** What is selected on the drawing in use, as shapes. */
function selected(): Shape[] {
  const { ui } = store().get();
  const d = activeDrawing();
  const ids = new Set(ui.selection);
  return d && d.kind === 'vector' ? d.shapes.filter((s) => ids.has(s.id)) : [];
}

type Made = { rings: number[][]; side: number; height: number; skipped: number };

/** The selection as a drawing to lay along a line, or why it can't be. */
function drawingFromSelection(): { ok: true; made: Made } | { ok: false; why: string } {
  const { layer } = activeLayer();
  if (!layer || layer.kind !== 'vector') return { ok: false, why: 'Select a drawing on a drawing layer first (the Select tool, V).' };
  const picked = selected();
  if (!picked.length) return { ok: false, why: 'Select the shapes you want to use first (the Select tool, V), then make the brush.' };
  const r = vectorStampFrom(picked, true);
  const tile = r && tileOf(r.rings);
  if (!r || !tile) return { ok: false, why: 'There is nothing in that selection to make a brush from. Text and symbols can\'t be used, and it needs some height and length.' };
  return { ok: true, made: { rings: r.rings, side: r.side, height: tile.h * r.side, skipped: r.skipped } };
}

const sizeFor = (height: number): number => Math.min(160, Math.max(4, Math.round(height)));

/** True when the drawing is wider than tall by a lot: a ribbon, which almost always wants to stretch. */
export const looksLikeRibbon = (rings: readonly number[][]): boolean => {
  const t = tileOf(rings);
  return !!t && (t.x1 - t.x0) / t.h >= 5;
};

/** Makes the brush go along the line, using the selection as its drawing. */
export function makeAlongBrush(): boolean {
  const r = drawingFromSelection();
  if (!r.ok) return warn(r.why);
  const { made } = r;
  const before = store().get().ui.brush;
  const apply = (answer: AlongFit | undefined) => {
    const fit: AlongFit = answer === 'repeat' ? 'repeat' : 'stretch';
    store().setUi((u) => ({ brush: { ...u.brush, size: sizeFor(made.height), thinning: 0, tip: { ...defaultTip('along'), custom: made.rings, fit } } }));
    showOptions();
    toast(`Made a brush from your selection. Draw a line and your drawing goes ${fit === 'repeat' ? 'along' : 'down'} it.${made.skipped ? ` ${made.skipped} could not be used.` : ''}`, {
      kind: 'success',
      action: { label: 'Undo', run: () => store().setUi({ brush: before }) },
    });
  };
  withChoice<AlongFit>('brush.alongFit', apply, { matters: !looksLikeRibbon(made.rings) });
  return true;
}

/** The edged brush now in use, if there is one. */
const currentEdged = (): BrushTip | undefined => {
  const t = store().get().ui.brush.tip;
  return t && t.kind === 'edged' ? t : undefined;
};

/** Which parts of the edged brush in use have a drawing. */
export function edgedHas(tip: BrushTip | undefined): Record<EdgedSlot, boolean> {
  const p = tip?.pieces ?? {};
  return { sides: !!tip?.custom?.length, start: !!p.start, end: !!p.end, inner: !!p.inner, outer: !!p.outer };
}

/** Sets one part of the edged brush from the selection. The sides come first: they start the brush. */
export function setEdgedPiece(slot: EdgedSlot): boolean {
  const cur = currentEdged();
  if (slot !== 'sides' && !cur) return warn('Start with the sides: select the middle part of your drawing and choose "Edged brush: sides from the selection".');
  const r = drawingFromSelection();
  if (!r.ok) return warn(r.why);
  const { made } = r;
  const before = store().get().ui.brush;
  if (slot === 'sides') {
    const keep = cur?.pieces;
    store().setUi((u) => ({ brush: { ...u.brush, size: sizeFor(made.height), thinning: 0, tip: { ...defaultTip('edged'), custom: made.rings, ...(keep ? { pieces: keep } : {}) } } }));
  } else {
    store().setUi((u) => ({ brush: { ...u.brush, tip: u.brush.tip && u.brush.tip.kind === 'edged' ? { ...u.brush.tip, pieces: { ...u.brush.tip.pieces, [slot]: made.rings } } : u.brush.tip } }));
  }
  showOptions();
  const label = EDGED_SLOTS.find((s) => s.id === slot)!.label.toLowerCase();
  toast(`Used your selection for the ${label}. Draw a line to see it.`, { kind: 'success', action: { label: 'Undo', run: () => store().setUi({ brush: before }) } });
  return true;
}

/** Takes one part out of the edged brush (the sides can't go: replace them instead). */
export function clearEdgedPiece(slot: Exclude<EdgedSlot, 'sides'>): void {
  store().setUi((u) => {
    const t = u.brush.tip;
    if (!t || t.kind !== 'edged' || !t.pieces) return {};
    const pieces: TipPieces = { ...t.pieces };
    delete pieces[slot];
    const { pieces: _gone, ...rest } = t;
    return { brush: { ...u.brush, tip: Object.keys(pieces).length ? { ...rest, pieces } : rest } };
  });
}

/** Turns the selected brush lines (chalk, stamps, your own brushes and the rest) into plain shapes that no longer change with the brush. */
export function flattenBrushLines(): boolean {
  const ids = new Set(store().get().ui.selection);
  let count = 0;
  const r = editShapes('Turn brush lines into plain shapes', (shapes) => {
    const out: Shape[] = [];
    for (const s of shapes) {
      const parts = ids.has(s.id) && s.type === 'stroke' && s.brush.tip ? strokeParts(s) : null;
      if (parts) {
        out.push(...parts);
        count++;
      } else out.push(s);
    }
    return count ? out : null;
  });
  if (r === 'ok') {
    // The old lines are gone from the picture: their parts are new shapes.
    store().setUi({ selection: [] });
    toast(`Turned ${count === 1 ? 'a brush line' : `${count} brush lines`} into plain shapes. Undo brings the brush back.`, { kind: 'success', action: { label: 'Undo', run: () => store().undo() } });
    return true;
  }
  if (r === 'nothing') return warn('Select a line drawn with a chalk, stamp or other tip first. Plain lines are already plain.');
  return warn(EDIT_HINTS[r]);
}
