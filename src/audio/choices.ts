// The sound area's remembered choices (see core/choices.ts). Preferences > Behaviour lists them.
import type { ChoiceDef } from '../core/choices';
import { choiceWord } from '../words/choices';

export type ScrubSoundChoice = 'on' | 'off';

const scrubSound: ChoiceDef<ScrubSoundChoice> = {
  id: 'audio.scrub',
  title: choiceWord('choice.audio.scrub.title'),
  question: choiceWord('choice.audio.scrub.question'),
  category: 'Sound',
  silent: true,
  default: 'on',
  help: 'Dragging the playhead (or stepping frame by frame) plays a short snippet of the sound at that spot, which is how you line up a mouth with a word.',
  options: [
    { value: 'on', label: choiceWord('choice.audio.scrub.on.label'), detail: choiceWord('choice.audio.scrub.on.detail') },
    { value: 'off', label: choiceWord('choice.audio.scrub.off.label'), detail: choiceWord('choice.audio.scrub.off.detail') },
  ],
};

export type LongSoundChoice = 'extend' | 'keep';

const longSound: ChoiceDef<LongSoundChoice> = {
  id: 'audio.longSound',
  title: choiceWord('choice.audio.longSound.title'),
  question: choiceWord('choice.audio.longSound.question'),
  category: 'Sound',
  default: 'extend',
  help: 'Frames added this way are empty, ready for you to draw on. Choosing "Keep it" leaves the end of the sound hanging past the last frame.',
  options: [
    { value: 'extend', label: choiceWord('choice.audio.longSound.extend.label'), detail: choiceWord('choice.audio.longSound.extend.detail') },
    { value: 'keep', label: choiceWord('choice.audio.longSound.keep.label'), detail: choiceWord('choice.audio.longSound.keep.detail') },
  ],
};

// Owned by Audio: the sound itself is exported with the video whether or not Audio is on (it is in the drawing), but
// this question about it, and its place in Preferences > Behaviour, goes with the feature.
export type Mp4SoundChoice = 'mp4' | 'webm';

const mp4Sound: ChoiceDef<Mp4SoundChoice> = {
  id: 'export.mp4Sound',
  title: choiceWord('choice.export.mp4Sound.title'),
  question:
    choiceWord('choice.export.mp4Sound.question'),
  category: 'Export',
  default: 'mp4',
  help: 'Installing ffmpeg fixes this for good: Frameling finds it and makes the sound AAC, which plays everywhere.',
  options: [
    { value: 'mp4', label: choiceWord('choice.export.mp4Sound.mp4.label'), detail: choiceWord('choice.export.mp4Sound.mp4.detail') },
    { value: 'webm', label: choiceWord('choice.export.mp4Sound.webm.label'), detail: choiceWord('choice.export.mp4Sound.webm.detail') },
  ],
};

export const audioChoices = [scrubSound, longSound, mp4Sound];
