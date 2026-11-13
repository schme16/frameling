// The pet's command and panel. Everything here belongs to the feature, so switching the pet off takes it all away
// and Quill carries on being the mascot.
import { lazyPanel } from '../core/lazy';
import type { Command, PanelDef } from '../core/registry';
import { showPanel } from '../ui/dock';
import { getPrefs } from '../ui/prefs';
import { noteFuss } from './watch';
import { giveToQuill } from './give';
import { tellQuill } from './store';

export const quillPetPanel: PanelDef = {
  id: 'quill-pet',
  title: 'Quill',
  icon: 'heart',
  component: lazyPanel(() => import('./QuillPetPanel').then((m) => m.QuillPetPanel)),
  zone: 'right',
  order: 85,
  help: 'quill-pet',
};

export const quillThingsPanel: PanelDef = {
  id: 'quill-things',
  title: "Quill's things",
  icon: 'image',
  component: lazyPanel(() => import('./QuillThingsPanel').then((m) => m.QuillThingsPanel)),
  zone: 'right',
  order: 86,
  help: 'quill-things',
};

export const quillPetCommands: Command[] = [
  {
    id: 'quillPet.open',
    label: "Quill's corner",
    category: 'View',
    description: 'Opens the panel where Quill lives, so you can see how he is and give him a stroke.',
    keywords: ['quill', 'pet', 'hedgehog', 'mascot', 'friend', 'corner', 'companion'],
    help: 'quill-pet',
    run: () => showPanel('quill-pet'),
  },
  {
    id: 'quillPet.pat',
    label: 'Give Quill a stroke',
    category: 'View',
    description: 'A quick fuss. He likes it, and you two get a little closer.',
    keywords: ['quill', 'pet', 'stroke', 'pat', 'fuss', 'hedgehog'],
    help: 'quill-pet',
    enabled: () => getPrefs().showQuill,
    run: () => {
      tellQuill({ kind: 'petted' });
      noteFuss();
      showPanel('quill-pet');
    },
  },
  {
    id: 'quillPet.things',
    label: "Quill's things",
    category: 'View',
    description: 'Opens the drawings you have given Quill.',
    keywords: ['quill', 'pet', 'things', 'collection', 'gifts', 'presents', 'drawings', 'kept'],
    help: 'quill-things',
    run: () => showPanel('quill-things'),
  },
  {
    id: 'quillPet.give',
    label: 'Give this drawing to Quill',
    category: 'View',
    description: 'He keeps a little picture of the frame you are on, in his corner, for as long as you like.',
    keywords: ['quill', 'pet', 'give', 'present', 'gift', 'keep', 'collection', 'hedgehog'],
    help: 'quill-pet',
    enabled: () => getPrefs().showQuill,
    run: () =>
      void giveToQuill().then((got) => {
        if (got) showPanel('quill-things');
      }),
  },
];
