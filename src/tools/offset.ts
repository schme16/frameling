/**
 * Offset path: a copy of a shape a few pixels bigger or smaller all the way round (an outline round a character, a cut
 * line, a second stroke). The maths is in src/geometry/offset.ts; this is the commands, the card and the words.
 */
import type { Id } from '../core/format';
import { registerChoice, withChoice } from '../core/choices';
import { registerCommands, registerHelp } from '../core/registry';
import { say } from '../core/reasons';
import { store, type State } from '../core/store';
import { toast } from '../ui/toast';
import { MAX_OFFSET, offsetShapes, type OffsetCorners, type OffsetKeep, type OffsetProblem, type OffsetResult } from '../geometry/offset';
import { choiceWord } from '../words/choices';
import { activeDrawing, activeLayer, EDIT_HINTS } from './edit';
import { cutBase, editShapes, selected, withGroups } from './merge-mode';
import { openOffsetBar } from './OffsetBar';

registerChoice<OffsetKeep>({
  id: 'shapes.offsetKeep',
  title: choiceWord('choice.shapes.offsetKeep.title'),
  question: choiceWord('choice.shapes.offsetKeep.question'),
  options: [
    { value: 'copy', label: choiceWord('choice.shapes.offsetKeep.copy.label'), detail: choiceWord('choice.shapes.offsetKeep.copy.detail'), did: choiceWord('choice.shapes.offsetKeep.copy.did') },
    { value: 'replace', label: choiceWord('choice.shapes.offsetKeep.replace.label'), detail: choiceWord('choice.shapes.offsetKeep.replace.detail'), did: choiceWord('choice.shapes.offsetKeep.replace.did') },
  ],
  default: 'copy',
  category: 'Drawing',
  help: 'offset-path',
});

/** The distance and corners last used, so the quick commands and the card start where you left off. A positive distance grows. */
let last: { distance: number; corners: OffsetCorners } = { distance: 6, corners: 'round' };
export const offsetDistance = (): { distance: number; corners: OffsetCorners } => ({ ...last });
export function rememberOffset(distance: number, corners: OffsetCorners): void {
  last = { distance: Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, distance)) || last.distance, corners };
}
export const signedDistance = (dir: 'out' | 'in', px: number): number => (dir === 'out' ? Math.abs(px) : -Math.abs(px));

export const offsetWords = {
  problem(p: OffsetProblem, dir: 'out' | 'in'): string {
    if (p === 'gone') return dir === 'in' ? 'That much would shrink the shape away to nothing. Try a smaller distance.' : 'That distance can’t be worked out for this shape. Try a smaller one.';
    return 'Pick a shape first. Symbols, text and particles have no outline to copy.';
  },
  tellNothingPicked(): void {
    toast('Pick a shape on a vector layer first, then copy it a bit bigger or smaller.');
  },
  done(r: Pick<OffsetResult, 'made' | 'gone' | 'skipped'>, d: number): string {
    const n = `${r.made} shape${r.made === 1 ? '' : 's'}`;
    const way = d > 0 ? 'bigger' : 'smaller';
    const left = r.gone ? ` ${r.gone} shrank away to nothing and was left as it was.` : '';
    const skipped = r.skipped ? ` ${r.skipped} symbol${r.skipped === 1 ? '' : 's'} or text left alone.` : '';
    return `Made ${n} ${Math.abs(d)} px ${way}.${left}${skipped}`;
  },
};

/** Runs the offset on the selected shapes, as one undo step. `keep` falls to the remembered answer when missing. */
function run(d: number, corners: OffsetCorners, keep: OffsetKeep): void {
  const layer = activeLayer();
  if (layer.problem) return void toast(EDIT_HINTS[layer.problem]);
  const picked = selected();
  if (!picked.length) return void offsetWords.tellNothingPicked();
  const drawing = activeDrawing();
  const base = cutBase(drawing && drawing.kind === 'vector' ? drawing.shapes : []);
  const ids = new Set<Id>(withGroups(base, picked.map((s) => s.id)));
  let result = null as OffsetResult | OffsetProblem | null;
  const r = editShapes(d > 0 ? 'Offset path: bigger' : 'Offset path: smaller', (before) => {
    const out = offsetShapes(cutBase(before), ids, d, corners, keep);
    result = out;
    return typeof out === 'string' ? null : out.shapes;
  });
  if (typeof result === 'string') return void toast(offsetWords.problem(result, d > 0 ? 'out' : 'in'));
  if (r !== 'ok') return void (r !== 'nothing' && toast(EDIT_HINTS[r]));
  if (!result) return;
  const done = result as OffsetResult;
  store().setUi({ selection: done.ids });
  toast(offsetWords.done(done, d));
}

/** Offsets the selected shapes by `d` (above 0 out, below 0 in), asking once whether the original stays. */
export function applyOffset(d: number, corners: OffsetCorners = last.corners): void {
  withChoice<OffsetKeep>('shapes.offsetKeep', (keep) => run(d, corners, keep), { gently: true });
}

/** Resizes the picked shapes themselves by `d` px (above 0 bigger, below 0 smaller), with no question: the selection's Grow and Shrink. */
export function resizePicked(d: number): void {
  run(d, last.corners, 'replace');
}

const canOffset = (s: State) => s.ui.selection.length > 0 && activeLayer().layer?.kind === 'vector';
const needShapeToOffset = say('Select a shape on a vector layer first.');

registerCommands([
  {
    id: 'offset.card',
    label: 'Copy a bit bigger or smaller (offset path)...',
    category: 'Vector',
    description: 'Make a copy of the picked shapes the same distance out, or in, all the way round. A card lets you pick bigger or smaller, slide the distance and watch it on the stage. Good for an outline round a character, a cut line or a second stroke.',
    help: 'offset-path',
    keywords: ['offset path', 'offset', 'outline', 'expand', 'contract', 'grow', 'shrink', 'inset', 'outset', 'border', 'sticker', 'cut line', 'second stroke', 'stroke round'],
    enabled: canOffset,
    reason: needShapeToOffset,
    run: () => void openOffsetBar(),
  },
]);

registerHelp({
  id: 'offset-path',
  title: 'Copy a shape a bit bigger or smaller',
  section: 'Drawing',
  media: 'offset-path.png',
  summary: 'Make a copy of a shape the same distance out or in all the way round: an outline round a character, a cut line, a second stroke (offset path).',
  keywords: ['offset path', 'offset', 'outline', 'expand', 'contract', 'grow', 'shrink', 'inset', 'outset', 'border', 'sticker', 'cut line', 'second stroke'],
});
