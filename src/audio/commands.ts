import { currentChoice, setChoice } from '../core/choices';
import type { Command } from '../core/registry';
import { store } from '../core/store';
import { toast } from '../ui/toast';
import { moveClip, importSound, pickedClip, removeClip, setMuted } from './ops';
import type { ScrubSoundChoice } from './choices';

const hasSound = () => !!store().get().doc.audio?.length;

export const audioCommands: Command[] = [
  {
    id: 'audio.import',
    label: 'Import sound...',
    category: 'File',
    description: 'Add speech, music or sound effects to line your drawings up with.',
    help: 'sound',
    keywords: ['audio', 'music', 'voice', 'speech', 'wav', 'mp3', 'ogg', 'sound effect', 'soundtrack', 'dialogue', 'narration'],
    run: () => void importSound(),
  },
  {
    id: 'audio.startHere',
    label: 'Start the sound at the playhead',
    category: 'Sound',
    description: 'Move the picked sound so it begins on the frame you are on.',
    help: 'sound',
    keywords: ['audio', 'move', 'offset', 'line up', 'sync'],
    enabled: hasSound,
    run: () => {
      const c = pickedClip();
      if (c) moveClip(c.id, store().get().ui.frame);
    },
  },
  {
    id: 'audio.mute',
    label: 'Mute or unmute the sound',
    category: 'Sound',
    description: 'Turn the picked sound off (or back on) without taking it out. Muted sounds are left out of exports.',
    help: 'sound',
    keywords: ['audio', 'silence', 'quiet', 'volume'],
    enabled: hasSound,
    run: () => {
      const c = pickedClip();
      if (c) setMuted(c.id, !c.muted);
    },
  },
  {
    id: 'audio.remove',
    label: 'Remove the sound',
    category: 'Sound',
    description: 'Take the picked sound out of the animation. Undo brings it back.',
    help: 'sound',
    keywords: ['audio', 'delete'],
    enabled: hasSound,
    run: () => {
      const c = pickedClip();
      if (!c) return;
      removeClip(c.id);
      toast(`Removed "${c.name}". Undo brings it back.`);
    },
  },
  {
    id: 'audio.scrub',
    label: 'Hear the sound while you drag the playhead',
    category: 'Sound',
    description: 'Plays a short snippet at the playhead as you scrub or step frame by frame.',
    help: 'sound',
    keywords: ['audio', 'scrub', 'snippet', 'preview', 'listen'],
    checked: () => currentChoice<ScrubSoundChoice>('audio.scrub') === 'on',
    run: () => setChoice('audio.scrub', currentChoice<ScrubSoundChoice>('audio.scrub') === 'on' ? 'off' : 'on'),
  },
];
