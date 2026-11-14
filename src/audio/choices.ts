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

// Owned by Audio: the sound itself is exported with the video whether or not Audio is on (it is in the drawing), but
// this question about it, and its place in Preferences > Behaviour, goes with the feature.
export type Mp4SoundChoice = 'mp4' | 'webm';

const mp4Sound: ChoiceDef<Mp4SoundChoice> = {
  id: 'export.mp4Sound',
  title: 'MP4 videos with sound',
  question:
    "This computer can't make the usual kind of sound for MP4 (AAC), so the sound would be Opus. Opus plays in Chrome, Edge, Firefox, VLC and Windows, but Apple's QuickTime, Safari and iPhones play the video silent. What would you like?",
  category: 'Export',
  default: 'mp4',
  help: 'Installing ffmpeg fixes this for good: Frameling finds it and makes the sound AAC, which plays everywhere.',
  options: [
    { value: 'mp4', label: 'Keep it MP4', detail: 'Sound plays almost everywhere, but not in QuickTime, Safari or on iPhones.' },
    { value: 'webm', label: 'Make a WebM instead', detail: 'Made for the web: plays with sound in every browser, though not in QuickTime.' },
  ],
};

export const audioChoices = [scrubSound, longSound, mp4Sound];
