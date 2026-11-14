// What the pet notices while you work. Started when the feature is turned on and stopped when it's turned off, so
// with the pet off nothing here is listening and Quill is just the mascot again.
import { store } from '../core/store';
import { petStore, firstVisitToday, tellQuill } from './store';
import { forgetPaint, paintQuills, plainQuills } from './quills';
import { onMascotSwitched } from '../ui/mascot/runtime';
import { line } from '../ui/mascot/lines';
import { toast } from '../ui/toast';
import { noteSeen } from './store';
import { stageOf } from './model';

const now = (): number => (typeof performance === 'undefined' ? Date.now() : performance.now());

let lastEdit = -Infinity;
let fussedAt = -Infinity;
let finishedAt = -Infinity;

/** Milliseconds since your last edit. Infinity until you've drawn something this run. */
export const sinceEdit = (): number => now() - lastEdit;
/** Milliseconds since you last made a fuss of him. */
export const sinceFuss = (): number => now() - fussedAt;
/** Milliseconds since you last finished something. */
export const sinceFinished = (): number => now() - finishedAt;

/** Stroking him, feeding him, giving him something: he notices for a few seconds. */
export function noteFuss(): void {
  fussedAt = now();
}
/** An export, a save, a quest finished: he's proud of you for a few seconds. */
export function noteFinished(): void {
  finishedAt = now();
  tellQuill({ kind: 'finished' });
}

/** For tests: back to knowing nothing. */
export function forgetNow(): void {
  lastEdit = -Infinity;
  fussedAt = -Infinity;
  finishedAt = -Infinity;
}

/**
 * Getting closer is worth saying out loud, once, wherever you are. The panel may well be shut, so it comes as one of
 * his toasts rather than a line only he can see.
 */
function sayIfCloser(): void {
  const pet = petStore.get();
  const stage = stageOf(pet.closeness);
  const id = `stage.${stage.id}`;
  if (stage.at === 0 || pet.seen.includes(id)) return;
  noteSeen(id);
  toast(line('pet.closer', { stage: stage.name.toLowerCase() }), { quill: 'cheer', duration: 6000 });
}

/** Starts watching. Gives back the way to stop, which the feature calls when it's switched off. */
export function startWatching(): () => void {
  const s = store();
  let prev = s.get();
  let loads = s.loads;
  if (firstVisitToday()) tellQuill({ kind: 'visited' });
  const off = s.subscribe(() => {
    const next = s.get();
    // Opening a document (or a template) is not you drawing, so he doesn't count it or take its colour.
    if (s.loads !== loads) {
      loads = s.loads;
      prev = next;
      return;
    }
    if (next.doc !== prev.doc) {
      lastEdit = now();
      tellQuill({ kind: 'drew' });
      // The colour you drew with goes in his quills. Worth no closeness: that would be paying you to change colour.
      if (next.ui.color) tellQuill({ kind: 'noticed', colour: next.ui.color });
    }
    if (next.ui.playing && !prev.ui.playing) tellQuill({ kind: 'played' });
    prev = next;
  });
  // Repaint his pencils whenever his colours change, and once now.
  const offPet = petStore.subscribe(() => {
    paintQuills(petStore.get().colours);
    sayIfCloser();
  });
  paintQuills(petStore.get().colours);
  // Another mascot arrived: his pencils are his own, so start the painting again on his sheet.
  const offSwitch = onMascotSwitched(() => {
    forgetPaint();
    paintQuills(petStore.get().colours);
  });
  return () => {
    off();
    offPet();
    offSwitch();
    plainQuills();
    forgetNow();
  };
}
