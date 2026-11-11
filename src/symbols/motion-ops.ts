// One-click motions from the menus and palette: one undo step each, a friendly line when they can't go.
import { registerChoice, withChoice } from '../core/choices';
import type { Doc, Id } from '../core/format';
import { findLayer } from '../core/doc';
import { motionDef, type MotionId } from '../core/motions';
import { store } from '../core/store';
import { toast } from '../ui/toast';
import { applyMotion, motionFits, motionProblem, type MotionRoom, type MotionWhere } from './motions';

registerChoice<MotionRoom>({
  id: 'motion.room',
  title: 'A motion that runs into the next drawing',
  question: 'This motion is longer than the gap before the next drawing on this layer. What should happen?',
  category: 'Animation',
  default: 'squeeze',
  help: 'You can change the speed afterwards by dragging the keys in the timeline.',
  options: [
    { value: 'squeeze', label: 'Make it quicker to fit', detail: 'The motion plays faster, and the next drawing stays where it is.' },
    { value: 'push', label: 'Move later drawings along', detail: 'The motion keeps its speed, and the drawings after it on this layer move later.' },
  ],
});

function where(layerId?: Id, frame?: number): MotionWhere | null {
  const { doc, ui } = store().get();
  const layer = findLayer(doc, layerId ?? ui.activeLayerId) ?? doc.layers[doc.layers.length - 1];
  if (!layer) return null;
  const sameKey = !layerId || layerId === ui.activeLayerId;
  return { layerId: layer.id, frame: frame ?? ui.frame, selection: sameKey ? ui.selection : [] };
}

/** Can a motion go on the active layer at the playhead (for greying out commands)? */
export function canMotion(doc: Doc = store().get().doc): boolean {
  const w = where();
  return !!w && !motionProblem(doc, w);
}

/** Adds a motion at the playhead (or a given layer and frame). Asks once what to do if it runs into the next drawing. */
export function makeMotion(id: MotionId, layerId?: Id, frame?: number): void {
  const w = where(layerId, frame);
  const doc = store().get().doc;
  if (!w) return void toast('Add a layer first, then draw something to move.', { kind: 'warn' });
  const why = motionProblem(doc, w);
  if (why) return void toast(why, { kind: 'warn' });
  if (motionFits(doc, w, id)) return run(id, w, 'squeeze');
  withChoice<MotionRoom>('motion.room', (room) => run(id, w, room));
}

function run(id: MotionId, w: MotionWhere, room: MotionRoom): void {
  const def = motionDef(id);
  let out: ReturnType<typeof applyMotion> | undefined;
  store().update(`Make it ${def.label.toLowerCase()}`, (doc) => {
    out = applyMotion(doc as Doc, w, id, room);
  });
  if (!out) return;
  if (!out.ok) return void toast(out.why, { kind: 'warn' });
  store().setUi({ frame: out.start, activeLayerId: w.layerId, selection: out.instanceIds, playing: false });
  const secs = Math.round((out.frames / store().get().doc.fps) * 10) / 10;
  toast(`${out.wrapped ? 'Made it a symbol and added' : 'Added'} "${def.label.toLowerCase()}" (${out.frames} frames, ${secs} s). Press play to see it. Every key is yours to change.`, {
    kind: 'success',
    action: { label: 'Play', run: () => store().setUi({ playing: true }) },
  });
}
