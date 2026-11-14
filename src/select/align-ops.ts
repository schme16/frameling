// Align and Spread out landing on the selection: the glue between the commands and buttons, the maths (align.ts) and the
// same landing code a drag and the typed numbers use (src/tools/select-land.ts), so each is one undo step.
import type { Id } from '../core/format';
import { store } from '../core/store';
import { hint } from '../canvas/controller';
import { shapeBounds, translate } from '../canvas/geometry';
import { setCut } from '../tools/merge-mode';
import { EDIT_HINTS } from '../tools/edit';
import { landMatrix, selectionTarget } from '../tools/select-land';
import { commit as landTransform } from '../transform/session';
import { alignPixelsTo, alignShifts, alignTarget, gapsOf, MIN_SPREAD, spreadShifts, unionBox, type AlignKind, type AlignTo, type Axis, type Boxed, type Shift } from './align';
import { getAlignTo } from './align-settings';
import { movePixelsTo, pixelBox } from './numbers-ops';
import { activePixelGrid, pixelSelection } from './pixel-state';

const WORDS: Record<AlignKind, string> = { left: 'left edges', centre: 'centres', right: 'right edges', top: 'tops', middle: 'middles', bottom: 'bottoms' };
const LABELS: Record<AlignKind, string> = { left: 'Align left', centre: 'Align centre', right: 'Align right', top: 'Align top', middle: 'Align middle', bottom: 'Align bottom' };

/** Lands one shift per shape as a single undo step. False when nothing needed to move (or it could not land). */
function land(label: string, shifts: Map<Id, Shift>): boolean {
  const t = selectionTarget();
  if (!t || !shifts.size) return false;
  const { result, ids } = landMatrix(label, t, (s) => {
    const d = shifts.get(s.id);
    return d ? translate(d.dx, d.dy) : null;
  });
  if (result === 'ok') {
    // Landed the merge way, the shapes that come out are the new selection.
    if (ids) {
      setCut(null);
      store().setUi({ selection: ids });
    }
    return true;
  }
  if (result !== 'nothing') hint(EDIT_HINTS[result]);
  return false;
}

function boxes(): Boxed[] {
  return selectionTarget()?.originals.map((s) => ({ id: s.id, box: shapeBounds(s) })) ?? [];
}

/** Is there anything Align or Spread out could work on: shapes picked on a vector layer, or a pixel selection. */
export function canAlign(): boolean {
  return !!selectionTarget() || !!pixelSelection();
}

/** How many shapes are picked (0 for a pixel selection, which is one piece). */
export function pickedCount(): number {
  return selectionTarget()?.originals.length ?? 0;
}

/** The page's box, for lining up to it. */
function pageBox() {
  const { doc } = store().get();
  return { x: 0, y: 0, w: doc.width, h: doc.height };
}

/** What a press of an Align button would line up to, for the buttons' tips. */
export function alignTargetNow(wanted: AlignTo = getAlignTo()): AlignTo {
  const n = pickedCount();
  return n ? alignTarget(n, wanted) : 'page';
}

/** Lines the picked shapes (or the picked pixels) up on one edge or middle. */
export function alignSelection(kind: AlignKind, wanted: AlignTo = getAlignTo()): boolean {
  // A Transform box with changes still waiting lands first, so this works on what is on the page.
  landTransform();
  const bs = boxes();
  if (!bs.length) {
    // Pixels: one selected piece, lined up to the page, in whole pixels so nothing is blended.
    const pb = pixelBox();
    const grid = activePixelGrid();
    if (!pb || !grid) {
      hint('Pick a shape first, then line it up.');
      return false;
    }
    const to = alignPixelsTo(pb, kind, grid.width, grid.height);
    const ok = movePixelsTo(to.x, to.y);
    if (!ok) hint(`Already lined up on the page's ${WORDS[kind]}.`);
    return ok;
  }
  const to = alignTarget(bs.length, wanted);
  const target = to === 'page' ? pageBox() : unionBox(bs)!;
  const shifts = alignShifts(bs, kind, target);
  if (!shifts.size) {
    hint(`Already lined up on the ${to === 'page' ? "page's " : ''}${WORDS[kind]}.`);
    return false;
  }
  return land(`${LABELS[kind]}${to === 'page' ? ' to page' : ''}`, shifts);
}

/** Spreads three or more picked shapes out so the gaps between them are the same, or exactly `gap` (page pixels). */
export function spreadSelection(axis: Axis, gap?: number | null): boolean {
  landTransform();
  const bs = boxes();
  if (!bs.length) {
    hint(pixelSelection() ? 'Spreading out works on shapes. A pixel selection is one piece.' : 'Pick three or more shapes first, then space them out.');
    return false;
  }
  if (bs.length < MIN_SPREAD) {
    hint(`Pick at least ${MIN_SPREAD} shapes to space them out (you have ${bs.length}). With two, line them up instead.`);
    return false;
  }
  const shifts = spreadShifts(bs, axis, gap);
  if (!shifts.size) {
    const g = gapsOf(bs, axis);
    hint(g.every((x) => Math.abs(x - g[0]) < 1e-6) ? 'The gaps are already even.' : 'Nothing to move.');
    return false;
  }
  return land(axis === 'across' ? 'Space out across' : 'Space out down', shifts);
}
