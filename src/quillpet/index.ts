// Quill as a pet: a panel he lives in, a memory of the two of you, and a fuss when you want one. A feature you can
// turn off (Preferences > Features), and turning it off leaves the mascot alone: his bubbles, his hellos, the
// onboarding and the quests all carry on exactly as they were. Show Quill in Preferences is the other switch, and
// that one hides him everywhere, pet included.
import { defineFeature } from '../features/feature';
import { quillPetCommands, quillPetPanel } from './commands';
import { quillPetHelp } from './help';
import { startWatching } from './watch';
import { watchForPresents } from './gifts';
import { registerPresentChoice } from './choices';

let stop: (() => void) | null = null;
let stopGifts: (() => void) | null = null;

export const quillPetFeature = defineFeature({
  id: 'quill-pet',
  name: 'Quill',
  about: 'A home for Quill in the right rail: how he is, the things you and he have given each other, and how well you know each other. Off, he is still your guide.',
  optional: true,
  commands: quillPetCommands,
  panels: [quillPetPanel],
  help: quillPetHelp,
  menus: [{ menu: 'View', items: ['quillPet.open', 'quillPet.give'] }],
  sections: {
    'quill-pet': {
      blurb: 'Quill, how he is, how well the two of you know each other, and the things you have given each other.',
      group: 'learn',
      keywords: ['quill', 'pet', 'hedgehog', 'friend', 'things', 'collection', 'gifts', 'presents', 'crayon', 'surprise'],
    },
  },
  activate: () => {
    registerPresentChoice();
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
