// Quill making you a present.
//
// He decides when, not you: a present you asked for is a toy, and a toy gets boring. The rules he lives by are in
// model.ts (`presentDue`); this is the part that needs a clock, a thumbnail and somewhere to put the news. Nothing
// here is generated: a present is your own drawing redrawn with a wobbly hand (crayon.ts).
//
// Three promises, and the tests hold them: never while you are mid-stroke, never more than one a day, and never a
// word about whether your drawing was any good.
import { store } from '../core/store';
import { thumbnailOf } from '../io/thumb';
import { toast } from '../ui/toast';
import { line } from '../ui/mascot/lines';
import { getPrefs } from '../ui/prefs';
import { showPanel } from '../ui/dock';
import { askAboutUnsavedChanges } from '../io/document';
import { currentChoice, withChoice } from '../core/choices';
import { crayonDoc } from './crayon';
import { presentDue, presentMark, sourceThing, stageOf, type PetState, type Present, type PresentReason } from './model';
import { keepPresent, noteSeen, notePresentOpened, petStore } from './store';
import { noteFuss, sinceEdit } from './watch';
import { THING_SIZE } from './give';

/** The choice about whether he does this at all. */
export const PRESENTS_CHOICE = 'quill.presents';

/** How long after your last mark counts as a quiet moment. He will not interrupt a drawing. */
export const QUIET = 12_000;
/** How often he looks up to see whether it's a good time. */
export const LOOK_UP = 45_000;

let n = 0;
const nextId = (): string => `g${Date.now().toString(36)}${(n++).toString(36)}`;

/** A quiet moment: you're not mid-stroke and nothing is playing. */
export function quietNow(sinceLastEdit: number, playing: boolean): boolean {
  return !playing && sinceLastEdit > QUIET;
}

/** Builds the present itself: the crayon copy, a little picture of it, and the note of what it came from. */
export async function makePresent(pet: PetState, at: number): Promise<Present | undefined> {
  const from = sourceThing(pet);
  if (!from?.source) return undefined;
  const seed = (at ^ (from.id.length * 2654435761)) >>> 0;
  const doc = crayonDoc(from.source, from.name, seed);
  const picture = await thumbnailOf(doc, THING_SIZE, 0);
  if (!picture) return undefined;
  return { id: nextId(), kind: 'crayon', name: from.name, picture, source: from.source, seed, madeAt: at };
}

/** The document a present opens as. Rebuilt from the recipe, so it is always the same present. */
export const docOfPresent = (p: Present) => crayonDoc(p.source, `${p.name} in crayon`, p.seed);

/**
 * He's made you one. The news is a quiet toast you can ignore: the present waits on his shelf either way, and he
 * never asks about it again.
 */
function sayMade(present: Present, reason: PresentReason): void {
  toast(line(reason === 'stage' ? 'pet.present.stage' : 'pet.present.made', { name: present.name }), {
    quill: 'cheer',
    duration: 8000,
    action: {
      label: 'Have a look',
      run: () => showPanel('quill-things'),
    },
  });
  // The first time, ask whether he should carry on doing this. The present is already made: the question is about
  // the next one, never about this one.
  withChoice(PRESENTS_CHOICE, () => {});
}

/** Makes one if he'd like to and it's a good moment. True when he made one. */
export async function tryPresent(at: number = Date.now()): Promise<boolean> {
  if (!getPrefs().showQuill) return false;
  if (currentChoice(PRESENTS_CHOICE) === 'no') return false;
  if (!quietNow(sinceEdit(), store().get().ui.playing)) return false;
  const pet = petStore.get();
  const reason = presentDue(pet, at);
  if (!reason) return false;
  const present = await makePresent(pet, at);
  if (!present) return false;
  // Marked before the news, so a stage only ever earns one present even if something goes wrong after.
  if (reason === 'stage') noteSeen(presentMark(stageOf(pet.closeness)));
  keepPresent(present);
  sayMade(present, reason);
  return true;
}

/** Opens a present as a document of your own, to carry on working in. */
export async function openPresentDoc(id: string): Promise<boolean> {
  const present = petStore.get().presents.find((p) => p.id === id);
  if (!present) return false;
  if (!(await askAboutUnsavedChanges())) return false;
  store().load(docOfPresent(present), null);
  notePresentOpened(id);
  noteFuss();
  return true;
}

/** Starts him looking up now and then. Gives back the way to stop. */
export function watchForPresents(): () => void {
  const timer = setInterval(() => void tryPresent(), LOOK_UP);
  return () => clearInterval(timer);
}
