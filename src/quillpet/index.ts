// Quill as a pet: a panel he lives in, a memory of the two of you, and a fuss when you want one. A feature you can
// turn off (Preferences > Features), and turning it off leaves the mascot alone: his bubbles, his hellos, the
// onboarding and the quests all carry on exactly as they were. Show Quill in Preferences is the other switch, and
// that one hides him everywhere, pet included.
import { defineFeature } from '../features/feature';
import { quillPetCommands, quillPetPanel } from './commands';
import { quillPetHelp } from './help';
import { startWatching } from './watch';

let stop: (() => void) | null = null;

export const quillPetFeature = defineFeature({
  id: 'quill-pet',
  name: "Quill's corner",
  about: 'Quill lives in a panel of his own, keeps you company while you draw, and remembers the two of you.',
  optional: true,
  commands: quillPetCommands,
  panels: [quillPetPanel],
  help: quillPetHelp,
  menus: [{ menu: 'View', items: ['quillPet.open', 'quillPet.give'] }],
  sections: {
    'quill-pet': {
      blurb: 'Quill, how he is, and how well the two of you know each other.',
      group: 'learn',
      keywords: ['quill', 'pet', 'hedgehog', 'friend'],
    },
  },
  activate: () => {
    stop = startWatching();
  },
  deactivate: () => {
    stop?.();
    stop = null;
  },
});

export { petStore, tellQuill } from './store';
export * from './model';
