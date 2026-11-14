/**
 * Join, Cut out, Keep the overlap and Punch a hole: the four ways to make one shape out of shapes you already have.
 * The maths is in src/geometry/boolean.ts (on top of merge drawing's clipping); this is the commands and the words.
 */
import type { Id } from '../core/format';
import { registerChoice, withChoice } from '../core/choices';
import { registerCommands, registerHelp } from '../core/registry';
import { store, type State } from '../core/store';
import { toast } from '../ui/toast';
import { COMBINE_OPS, COMBINE_WORDS, combineShapes, looksDiffer, type CombineOp, type CombineProblem, type CombineResult, type LookFrom } from '../geometry/boolean';
import { withGroups, cutBase, editShapes, selected } from './merge-mode';
import { activeDrawing, activeLayer, EDIT_HINTS } from './edit';
import { choiceWord } from '../words/choices';

registerChoice<LookFrom>({
  id: 'shapes.combineLook',
  title: choiceWord('choice.shapes.combineLook.title'),
  question: choiceWord('choice.shapes.combineLook.question'),
  options: [
    { value: 'bottom', label: choiceWord('choice.shapes.combineLook.bottom.label'), detail: choiceWord('choice.shapes.combineLook.bottom.detail'), did: choiceWord('choice.shapes.combineLook.bottom.did') },
    { value: 'top', label: choiceWord('choice.shapes.combineLook.top.label'), detail: choiceWord('choice.shapes.combineLook.top.detail'), did: choiceWord('choice.shapes.combineLook.top.did') },
  ],
  default: 'bottom',
  category: 'Drawing',
  help: 'combine-shapes',
});

/** What to say when nothing could be done, in plain words. */
export function problemWords(op: CombineOp, p: CombineProblem): string {
  if (p === 'few') return 'Pick two or more shapes first. Symbols, text and particles can’t be combined.';
  if (p === 'apart') return op === 'cut' ? 'The top shape doesn’t touch the others, so there is nothing to cut out.' : 'These shapes don’t overlap, so there is nothing to keep.';
  return 'Nothing would be left, so the shapes stay as they were.';
}

/** The toast after it worked: what was done, and what happened to the colours. */
export function doneWords(op: CombineOp, r: Pick<CombineResult, 'used' | 'skipped'>, look: LookFrom): string {
  const w = COMBINE_WORDS[op];
  const n = `${r.used} shape${r.used === 1 ? '' : 's'}`;
  const colours = op === 'cut' ? 'Each one under it keeps its colours.' : look === 'top' ? 'It wears the top shape’s colours.' : 'It wears the bottom shape’s colours.';
  const left = r.skipped ? ` ${r.skipped} symbol${r.skipped === 1 ? '' : 's'} or text left alone.` : '';
  return `${w.did} ${n}. ${colours}${left}`;
}

/** Runs one of the four on the selected shapes, as one undo step. */
export function combineSelected(op: CombineOp, forceLook?: LookFrom): void {
  const layer = activeLayer();
  if (layer.problem) return void toast(EDIT_HINTS[layer.problem]);
  const picked = selected();
  if (picked.length < 2) return void toast(problemWords(op, 'few'));
  const d = activeDrawing();
  const base = cutBase(d && d.kind === 'vector' ? d.shapes : []);
  const ids = new Set<Id>(withGroups(base, picked.map((s) => s.id)));
  const go = (look: LookFrom) => {
    let result = null as CombineResult | CombineProblem | null;
    const r = editShapes(`${COMBINE_WORDS[op].label} shapes`, (before) => {
      const out = combineShapes(cutBase(before), ids, op, look);
      result = out;
      return typeof out === 'string' ? null : out.shapes;
    });
    if (typeof result === 'string') return void toast(problemWords(op, result));
    if (r !== 'ok') return void (r !== 'nothing' && toast(EDIT_HINTS[r]));
    if (!result) return;
    const done = result as CombineResult;
    store().setUi({ selection: done.ids });
    toast(doneWords(op, done, look));
  };
  if (forceLook) return go(forceLook);
  // Only asked when the shapes really differ, and then as a gentle toast: it does the usual thing and lets you change it.
  withChoice<LookFrom>('shapes.combineLook', go, { matters: op !== 'cut' && looksDiffer(base, ids), gently: true });
}

const canCombine = (s: State) => s.ui.selection.length >= 2 && activeLayer().layer?.kind === 'vector';

const SHAPE_WORDS: Record<CombineOp, { description: string; keywords: string[] }> = {
  join: { description: 'Make the selected shapes one shape, covering everywhere any of them did (union). It keeps the bottom shape’s colours.', keywords: ['union', 'merge', 'combine', 'add', 'weld', 'pathfinder', 'unite'] },
  cut: { description: 'The top shape punches its outline out of the shapes under it, and goes (subtract). The shapes under it keep their colours.', keywords: ['subtract', 'minus', 'difference', 'crescent', 'bite', 'knock out', 'pathfinder', 'minus front'] },
  overlap: { description: 'Keep only where the selected shapes cross over each other (intersect).', keywords: ['intersect', 'crop', 'common', 'overlap', 'pathfinder', 'lens'] },
  punch: { description: 'Keep everything except where the shapes cross over each other, which becomes a hole (exclude).', keywords: ['exclude', 'xor', 'hole', 'knock out', 'pathfinder', 'key hole'] },
};

registerCommands(
  COMBINE_OPS.map((op) => ({
    id: `shapes.${op}`,
    label: COMBINE_WORDS[op].label,
    category: 'Arrange',
    description: SHAPE_WORDS[op].description,
    help: 'combine-shapes',
    keywords: SHAPE_WORDS[op].keywords,
    enabled: canCombine,
    run: () => combineSelected(op),
  })),
);

registerHelp({
  id: 'combine-shapes',
  title: 'Join, cut out and overlap shapes',
  section: 'Drawing',
  media: 'combine-shapes.png',
  summary: 'Make one shape out of several: join them, cut one out of another, keep where they overlap, or punch a hole where they cross.',
  keywords: ['union', 'subtract', 'intersect', 'exclude', 'pathfinder', 'boolean', 'crescent', 'combine shapes', 'join shapes', 'cut out', 'hole'],
});
