// The pet's command and panel. Everything here belongs to the feature, so switching the pet off takes it all away
// and Quill carries on being the mascot.
import { lazyPanel } from '../core/lazy';
import type { Command, PanelDef } from '../core/registry';
import { currentChoice, setChoice } from '../core/choices';
import { getPrefs } from '../ui/prefs';
import { toast } from '../ui/toast';
import { noteFuss } from './watch';
import { giveToQuill } from './give';
import { tellQuill } from './store';
import { openHouse } from './house';
import { YOURS_CHOICE } from './made';

export const quillPetPanel: PanelDef = {
  id: 'quill-pet',
  title: 'Quill',
  icon: 'heart',
  component: lazyPanel(() => import('./QuillPetPanel').then((m) => m.QuillPetPanel)),
  zone: 'right',
  order: 85,
  help: 'quill-pet',
};

export const quillPetCommands: Command[] = [
  {
    id: 'quillPet.open',
    label: 'Quill',
    category: 'View',
    description: "Opens Quill's house on the room: how he is, how well you know each other, and the way to his lessons. His things and his presents are tabs beside it.",
    keywords: ['quill', 'pet', 'hedgehog', 'mascot', 'friend', 'corner', 'companion'],
    help: 'quill-pet',
    run: () => openHouse('room'),
  },
  {
    id: 'quillPet.things',
    label: 'Quill: his things',
    category: 'View',
    description: 'Opens his house on the things you have given him, with the button to give him another.',
    keywords: ['quill', 'pet', 'things', 'shelf', 'shelves', 'collection', 'given', 'gifts', 'keep', 'hedgehog'],
    help: 'quill-things',
    run: () => openHouse('things'),
  },
  {
    id: 'quillPet.presents',
    label: 'Quill: his presents',
    category: 'View',
    description: 'Opens his house on the presents he has made you. Press one and it opens as a drawing of your own.',
    keywords: ['quill', 'pet', 'presents', 'gifts', 'crayon', 'surprise', 'made', 'hedgehog'],
    help: 'quill-presents',
    run: () => openHouse('presents'),
  },
  {
    id: 'quillPet.pat',
    label: 'Give Quill a scratch',
    category: 'View',
    description: 'A quick fuss. He likes it, and you two get a little closer.',
    keywords: ['quill', 'pet', 'scratch', 'stroke', 'pat', 'fuss', 'hedgehog'],
    help: 'quill-pet',
    enabled: () => getPrefs().showQuill,
    run: () => {
      tellQuill({ kind: 'petted' });
      noteFuss('stroked');
      openHouse('room');
    },
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
        if (got) openHouse('things');
      }),
  },
  {
    id: 'quillPet.yours',
    label: 'Quill: show or hide my work in his room',
    category: 'View',
    description: 'His room shows what you have made: your newest drawings on his wall and your newest sprite as a toy on his floor. This turns that off, or back on. Nothing is lost either way.',
    keywords: ['quill', 'pet', 'room', 'wall', 'toy', 'sprite', 'drawing', 'yours', 'mine', 'work', 'hedgehog'],
    help: 'quill-yours',
    run: () => {
      const hiding = currentChoice(YOURS_CHOICE) !== 'hide';
      setChoice(YOURS_CHOICE, hiding ? 'hide' : 'show');
      toast(hiding ? 'His room is plain for now. Your work is still kept.' : 'Your work is back on his wall and floor.', { duration: 3000 });
      if (!hiding) openHouse('room');
    },
  },
];
