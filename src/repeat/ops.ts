// Putting a repeat on the picked shapes, changing it afterwards, and taking it off. Every change is one undo step (a
// number being typed or a handle being dragged is one step, by `coalesce`). The maths is in src/geometry/repeat.ts and
// the making of the copies in src/core/repeats.ts.
import type { Repeat, Shape } from '../core/format';
import { registerChoice, withChoice } from '../core/choices';
import { canRepeat, drawingRepeats, repeatCopies } from '../core/repeats';
import { uid } from '../core/doc';
import { store, useStore } from '../core/store';
import { shapesBounds, shapesExtent, type Pt, type Rect } from '../canvas/geometry';
import { MAX_REPEAT, repeatCount } from '../geometry/repeat';
import { activeDrawing, activeLayer, EDIT_HINTS } from '../tools/edit';
import { editShapes, groupShapes, selected, withGroups } from '../tools/merge-mode';
import { toast } from '../ui/toast';
import { choiceWord } from '../words/choices';

export type RepeatKind = Repeat['kind'];
export type RingTurn = 'follow' | 'upright';

registerChoice<RingTurn>({
  id: 'repeat.ringTurn',
  title: choiceWord('choice.repeat.ringTurn.title'),
  question: choiceWord('choice.repeat.ringTurn.question'),
  options: [
    { value: 'follow', label: choiceWord('choice.repeat.ringTurn.follow.label'), detail: choiceWord('choice.repeat.ringTurn.follow.detail'), did: choiceWord('choice.repeat.ringTurn.follow.did') },
    { value: 'upright', label: choiceWord('choice.repeat.ringTurn.upright.label'), detail: choiceWord('choice.repeat.ringTurn.upright.detail'), did: choiceWord('choice.repeat.ringTurn.upright.did') },
  ],
  default: 'follow',
  category: 'Drawing',
  help: 'repeat',
});

export const repeatWords = {
  nothingPicked: 'Pick a shape on a vector layer first, then repeat it.',
  kindName: (k: RepeatKind): string => (k === 'grid' ? 'rows and columns' : k === 'ring' ? 'a ring' : 'a mirror image'),
  made: (k: RepeatKind, r: Repeat): string => {
    const n = repeatCount(r);
    if (k === 'mirror') return 'Repeated as a mirror image. Drag the line to move it.';
    return `Repeated ${n - 1} more ${n === 2 ? 'time' : 'times'}, as ${k === 'grid' ? 'rows and columns' : 'a ring'}.`;
  },
  held: `That is the most copies one repeat makes (${MAX_REPEAT} shapes in all), so it stops there.`,
};

/** The shapes the repeat would go on: the picked ones on the active vector layer that can repeat. */
export function pickedRepeatable(): Shape[] {
  const { layer } = activeLayer();
  if (!layer || layer.kind !== 'vector') return [];
  return selected().filter(canRepeat);
}

/** The repeat of the first picked shape that has one. */
export function currentRepeat(): { shape: Shape; repeat: Repeat } | null {
  for (const s of pickedRepeatable()) if ('repeat' in s && s.repeat) return { shape: s, repeat: s.repeat };
  return null;
}

/** The box round what is picked (the shapes themselves, not their copies). */
export function pickedBox(): Rect | null {
  const p = pickedRepeatable();
  return p.length ? shapesBounds(p) : null;
}

/** The box round what is picked and all its copies. */
export function pickedExtent(): Rect | null {
  const p = pickedRepeatable();
  return p.length ? shapesExtent(p) : null;
}

export function pageMiddle(): Pt {
  const { doc } = store().get();
  return { x: doc.width / 2, y: doc.height / 2 };
}

const GAP = 12;

function tell(message: string): null {
  toast(message);
  return null;
}

/** A repeat to start from: sensible for the box it goes round, so the first thing seen already looks like something. */
export function startingRepeat(kind: RepeatKind, box: Rect, turn: RingTurn): Repeat {
  const mid = pageMiddle();
  if (kind === 'grid') return { kind: 'grid', cols: 3, rows: 3, dx: Math.round(box.w + GAP), dy: Math.round(box.h + GAP) };
  if (kind === 'ring') {
    const out: Repeat = { kind: 'ring', count: 8, cx: Math.round(mid.x), cy: Math.round(mid.y) };
    if (turn === 'upright') out.turn = false;
    return out;
  }
  return { kind: 'mirror', x: Math.round(mid.x), y: Math.round(mid.y) };
}

/** Puts a repeat on every picked shape. Several shapes that are not one group are grouped first, so they repeat as one. */
function put(label: string, make: (box: Rect) => Repeat): Repeat | null {
  const layer = activeLayer();
  if (layer.problem) return tell(EDIT_HINTS[layer.problem]);
  const picked = pickedRepeatable();
  if (!picked.length) return tell(repeatWords.nothingPicked);
  const box = shapesBounds(picked)!;
  const repeat = make(box);
  const drawing = activeDrawing();
  const base = drawing && drawing.kind === 'vector' ? drawing.shapes : [];
  const ids = new Set(withGroups(base, picked.map((s) => s.id)).filter((id) => picked.some((p) => p.id === id)));
  const oneGroup = picked.length > 1 && picked[0].group && picked.every((s) => s.group === picked[0].group);
  const r = editShapes(label, (before) => {
    let shapes = before as Shape[];
    if (ids.size > 1 && !oneGroup) shapes = groupShapes(shapes, ids).shapes;
    return shapes.map((s) => (ids.has(s.id) ? ({ ...s, repeat } as Shape) : s));
  });
  if (r === 'nothing') return null;
  if (r !== 'ok') return tell(EDIT_HINTS[r]);
  return repeat;
}

/** Repeats the picked shapes in rows and columns. */
export function repeatAsGrid(): Repeat | null {
  const r = put('Repeat in rows and columns', (box) => startingRepeat('grid', box, 'follow'));
  if (r) toast(repeatWords.made('grid', r));
  return r;
}

/** Repeats the picked shapes round a ring, asking once whether the copies turn. */
export function repeatAsRing(then?: (r: Repeat) => void): void {
  if (!pickedRepeatable().length) return void toast(repeatWords.nothingPicked);
  withChoice<RingTurn>(
    'repeat.ringTurn',
    (turn) => {
      const r = put('Repeat round a ring', (box) => startingRepeat('ring', box, turn));
      if (r) {
        toast(repeatWords.made('ring', r));
        then?.(r);
      }
    },
    { gently: { undo: () => void store().undo() } },
  );
}

/** Repeats the picked shapes as a mirror image across the middle of the page. */
export function repeatAsMirror(): Repeat | null {
  const r = put('Repeat as a mirror image', (box) => startingRepeat('mirror', box, 'follow'));
  if (r) toast(repeatWords.made('mirror', r));
  return r;
}

/** Changes the repeat of every picked shape that has one. `coalesce` joins a run of changes (typing, dragging) into one undo step. */
export function changeRepeat(label: string, fn: (r: Repeat, s: Shape) => Repeat, coalesce?: string): boolean {
  const picked = pickedRepeatable().filter((s) => 'repeat' in s && s.repeat);
  if (!picked.length) return false;
  const ids = new Set(picked.map((s) => s.id));
  const r = editShapes(label, (before) => before.map((s) => (ids.has(s.id) && 'repeat' in s && s.repeat ? ({ ...s, repeat: fn(s.repeat, s) } as Shape) : s)), { coalesce });
  return r === 'ok';
}

/** Takes the repeat off the picked shapes. The shapes stay; the copies go. */
export function takeRepeatOff(): void {
  const picked = pickedRepeatable().filter((s) => 'repeat' in s && s.repeat);
  if (!picked.length) return;
  const ids = new Set(picked.map((s) => s.id));
  editShapes('Take the repeat off', (before) =>
    before.map((s) => {
      if (!ids.has(s.id)) return s;
      const { repeat: _gone, ...rest } = s as Shape & { repeat?: Repeat };
      return rest as Shape;
    }),
  );
}

/** Turns the copies into shapes of their own, so each can be picked and changed. The repeat is gone after it. */
export function turnIntoShapes(): void {
  const picked = pickedRepeatable().filter((s) => 'repeat' in s && s.repeat);
  if (!picked.length) return;
  const ids = new Set(picked.map((s) => s.id));
  const drawing = activeDrawing();
  const all = drawing && drawing.kind === 'vector' ? drawing.shapes : [];
  let made = 0;
  let last: string[] = [];
  editShapes('Turn the repeat into shapes', (before) => {
    const out: Shape[] = [];
    for (const s of before) {
      if (!ids.has(s.id)) {
        out.push(s);
        continue;
      }
      const { repeat: _gone, ...rest } = s as Shape & { repeat?: Repeat };
      const copies = repeatCopies(s, all).map((c) => ({ ...c, id: uid('sh') }) as Shape);
      made += copies.length;
      last = copies.map((c) => c.id);
      out.push(rest as Shape, ...copies);
    }
    return out;
  });
  if (made) {
    store().setUi({ selection: [...picked.map((s) => s.id), ...last] });
    toast(`Turned the repeat into ${made} shape${made === 1 ? '' : 's'} of their own.`);
  }
}

/** True when the drawing on show has any repeat. */
export const activeHasRepeats = (): boolean => drawingRepeats(activeDrawing());

/** The panel re-renders when the document, the selection or the layer changes. */
export function useRepeatState(): { shapes: Shape[]; current: { shape: Shape; repeat: Repeat } | null } {
  useStore((s) => s.doc);
  useStore((s) => s.ui.selection);
  useStore((s) => s.ui.activeLayerId);
  useStore((s) => s.ui.frame);
  return { shapes: pickedRepeatable(), current: currentRepeat() };
}
