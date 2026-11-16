// Putting words on a curve, taking them off again, and what the panel changes. The picking and the sentences are here;
// the maths is in onPath.ts, and keeping the words glued to their line is onPathSettle.ts.
import type { Draft } from 'immer';
import type { Id, Shape, TextShape, VectorDrawing } from '../core/format';
import { uid } from '../core/doc';
import { withChoice } from '../core/choices';
import { store } from '../core/store';
import { transformMatrix } from '../core/symbols';
import { currentKey } from '../symbols/ops';
import { EDIT_HINTS } from '../tools/edit';
import { toast } from '../ui/toast';
import { newTextShape } from './model';
import { curveInTextSpace, curveOfShape, isCurveShape, newOnPath, polyOf, turnedOnPath } from './onPath';
import { selectedTexts, textDefaults, updateTexts } from './ops';

export type PathSide = 'outside' | 'inside';

/** What is picked: words, and lines or shapes the words could run along. */
export function pickedForPath(): { texts: TextShape[]; curves: Shape[] } {
  const k = currentKey();
  if (!k) return { texts: [], curves: [] };
  const sel = new Set(store().get().ui.selection);
  const picked = k.drawing.shapes.filter((s) => sel.has(s.id));
  return { texts: picked.filter((s): s is TextShape => s.type === 'text'), curves: picked.filter((s) => isCurveShape(s) && !!curveOfShape(s)) };
}

/** Why Put text on a curve cannot run now, in the words to show beside it (undefined when it can). */
export function whyNoTextOnPath(): string | undefined {
  const { curves } = pickedForPath();
  if (curves.length === 0) return 'Pick a line or shape for the words to run along first.';
  if (curves.length > 1) return 'Pick just one line or shape for the words to run along.';
  return undefined;
}

/** Why Take text off the curve cannot run now. */
export function whyNoTextOffPath(): string | undefined {
  return selectedTexts().some((t) => t.onPath) ? undefined : 'Select some words that run along a curve first.';
}

/** Words for a curve that has none: what they say and how big, so they fit a small badge or a long wave. */
function startingWords(curveLength: number): { text: string; size: number } {
  const text = 'Words on a curve';
  const d = textDefaults();
  return { text, size: Math.round(Math.max(10, Math.min(d.size, curveLength / (text.length * 0.9)))) };
}

/** Runs the picked words along the picked line. With no words picked it makes some. Asks once which side, for a closed shape. */
export function putTextOnCurve(): void {
  const k = currentKey();
  if (!k) return void toast(EDIT_HINTS['no-layer']);
  if (k.layer.locked) return void toast(EDIT_HINTS.locked);
  const why = whyNoTextOnPath();
  if (why) return void toast(why);
  const { texts, curves } = pickedForPath();
  const curve = curves[0];
  const stage = curveOfShape(curve)!;
  // A closed shape has two natural answers (round the outside or round the inside), so it is the only one that asks.
  withChoice<PathSide>('text.pathSide', (side) => apply(k.drawing.id, curve.id, texts.map((t) => t.id), side), { matters: stage.closed, gently: true });
}

function apply(drawingId: Id, curveId: Id, textIds: Id[], side: PathSide): void {
  const doc = store().get().doc;
  const d = doc.drawings[drawingId];
  const curve = d?.kind === 'vector' ? d.shapes.find((s) => s.id === curveId) : undefined;
  const stage = curve && curveOfShape(curve);
  if (!d || d.kind !== 'vector' || !curve || !stage) return;
  const fresh = textIds.length === 0;
  const made: TextShape[] = [];
  if (fresh) {
    const { text, size } = startingWords(polyOf(stage).length);
    const def = textDefaults();
    made.push(newTextShape(uid('tx'), { x: 0, y: 0 }, { text, size, font: def.font, weight: def.weight, color: store().get().ui.color }));
  }
  const group = curve.group ?? uid('g');
  store().update(fresh ? 'Add words on a curve' : 'Put text on a curve', (draft) => {
    const dr = draft.drawings[drawingId] as Draft<VectorDrawing>;
    const c = dr.shapes.find((s) => s.id === curveId);
    if (!c) return;
    c.group = group;
    for (const m of made) dr.shapes.push(m as Draft<TextShape>);
    for (const s of dr.shapes) {
      if (s.type !== 'text' || !(textIds.includes(s.id) || made.some((m) => m.id === s.id))) continue;
      const mat = transformMatrix(s.transform, { x: 0, y: 0 });
      s.onPath = newOnPath(curveInTextSpace(stage, mat), curveId, side) as Draft<TextShape>['onPath'];
      s.group = group;
      // Round a closed shape the words sit in the middle of the top (or bottom), so they are centred; along a line they start at its start.
      if (stage.closed) s.align = 'center';
    }
  });
  const ids = [...textIds, ...made.map((m) => m.id), curveId];
  store().setUi({ selection: ids });
}

/** Takes the picked words off their curve: they stay where they are, as a straight line of words again. */
export function takeTextOffCurve(): void {
  const k = currentKey();
  if (!k) return;
  if (k.layer.locked) return void toast(EDIT_HINTS.locked);
  const some = selectedTexts().filter((t) => t.onPath);
  if (!some.length) return void toast(whyNoTextOffPath()!);
  updateTexts('Take text off the curve', (s) => void delete s.onPath);
  toast('The words are on a straight line again. They are still grouped with the curve; ungroup to move them apart.');
}

/** What the panel changes about words on a curve. Each is one undo step (sliders join into one). */
export function setPathSide(id: Id, side: PathSide): void {
  updateTexts('Words on the other side', (s) => void (s.onPath = turnedOnPath(s.onPath!, { side }) as Draft<TextShape>['onPath']), { id });
}
export function setPathFlip(id: Id, flip: boolean): void {
  updateTexts('Turn the words round the curve', (s) => void (s.onPath = turnedOnPath(s.onPath!, { flip }) as Draft<TextShape>['onPath']), { id });
}
export function setPathStart(id: Id, fraction: number): void {
  updateTexts('Move where the words start', (s) => void (s.onPath!.start = Math.round(Math.min(1, Math.max(0, fraction)) * 1000) / 1000), { id, coalesce: `path-start-${id}` });
}
export function setPathOffset(id: Id, px: number): void {
  updateTexts('Move the words off the curve', (s) => void (s.onPath!.offset = Math.round(px * 10) / 10 || undefined), { id, coalesce: `path-off-${id}` });
}
