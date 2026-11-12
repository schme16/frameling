// The sound area's remembered choices (see core/choices.ts). Preferences > Behaviour lists them.
import type { ChoiceDef } from '../core/choices';

export type ScrubSoundChoice = 'on' | 'off';

const scrubSound: ChoiceDef<ScrubSoundChoice> = {
  id: 'audio.scrub',
  title: 'Hear the sound while you drag the playhead',
  question: 'Play a short bit of the sound as you move the playhead?',
  category: 'Sound',
  silent: true,
  default: 'on',
  help: 'Dragging the playhead (or stepping frame by frame) plays a short snippet of the sound at that spot, which is how you line up a mouth with a word.',
  options: [
    { value: 'on', label: 'Yes, play a snippet', detail: 'You hear the sound at the playhead as you scrub or step.' },
    { value: 'off', label: 'No, keep it quiet', detail: 'Sound plays only when you press play.' },
  ],
};

export type LongSoundChoice = 'extend' | 'keep';

const longSound: ChoiceDef<LongSoundChoice> = {
  id: 'audio.longSound',
  title: 'A sound longer than the animation',
  question: 'This sound is longer than your animation. Make the animation as long as the sound?',
  category: 'Sound',
  default: 'extend',
  help: 'Frames added this way are empty, ready for you to draw on. Choosing "Keep it" leaves the end of the sound hanging past the last frame.',
  options: [
    { value: 'extend', label: 'Make it as long as the sound', detail: 'Adds empty frames so the whole sound fits.' },
    { value: 'keep', label: 'Keep my animation as it is', detail: 'The end of the sound goes past the last frame and is not played or exported.' },
  ],
};

export const audioChoices = [scrubSound, longSound];
