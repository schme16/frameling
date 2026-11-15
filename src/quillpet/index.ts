// Quill as a pet: a panel he lives in, a memory of the two of you, and a fuss when you want one. A feature you can
// turn off (Preferences > Features), and turning it off leaves the mascot alone: his bubbles, his hellos, the
// onboarding and the quests all carry on exactly as they were. Show Quill in Preferences is the other switch, and
// that one hides him everywhere, pet included.
import { defineFeature } from '../features/feature';
import { quillPetCommands, quillPetPanel } from './commands';
import { quillPetHelp } from './help';
import { startWatching } from './watch';
import { watchForPresents } from './gifts';
import { registerPresentChoice, registerYoursChoice } from './choices';
import { registerSaveHook } from '../io/document';
import { noteMade } from './madeNow';

let stop: (() => void) | null = null;
let stopGifts: (() => void) | null = null;

export const quillPetFeature = defineFeature({
  id: 'quill-pet',
  name: 'Quill',
  about: 'A house for Quill in the right rail, with three tabs: his room (how he is, how well you know each other, and the drawings and sprites you have made), his things (the drawings you have given him) and the presents he makes you. Off, he is still your guide.',
  optional: true,
  commands: quillPetCommands,
  panels: [quillPetPanel],
  help: quillPetHelp,
  menus: [{ menu: 'View', items: ['quillPet.open'] }],
  sections: {
    'quill-pet': {
      blurb: 'Quill, how he is, how well the two of you know each other, and the things you have given each other.',
      group: 'learn',
      keywords: ['quill', 'pet', 'hedgehog', 'friend', 'things', 'collection', 'gifts', 'presents', 'crayon', 'surprise', 'wall', 'toy', 'sprite', 'yours'],
    },
  },
  activate: () => {
    registerPresentChoice();
    registerYoursChoice();
    // Whatever you make and save goes in his room, with no question asked.
    registerSaveHook({ after: async (doc) => void (await noteMade(doc)) });
    stop = startWatching();
    stopGifts = watchForPresents();
  },
  deactivate: () => {
    stop?.();
    stop = null;
    stopGifts?.();
    stopGifts = null;
  },
});

export { petStore, tellQuill } from './store';
export * from './model';
