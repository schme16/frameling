// Sound: import, timeline rows, playback and scrubbing, export. A feature that can be turned off (Preferences >
// Features); the descriptor says everything it adds. The sound data itself stays in the document (`doc.audio`), so a
// drawing with the feature off keeps its sounds, and they come back when it is turned on.
import { anyAudio } from '../core/scan';
import { defineFeature } from '../features/feature';
import { registerTimelinePart } from '../timeline/slots';
import { audioChoices } from './choices';
import { audioCommands } from './commands';
import { installSoundDrop } from './drop';
import { installAudio } from './engine';
import { audioHelp } from './help';
import { SoundButton } from './SoundButton';
import { SoundMain, SoundSide } from './SoundRows';

export { addSound, importSound } from './ops';

let stops: (() => void)[] = [];

export const audioFeature = defineFeature({
  id: 'audio',
  name: 'Audio',
  about: 'Sound clips on the timeline, with a waveform and playback.',
  optional: true,
  commands: audioCommands,
  help: audioHelp,
  choices: audioChoices,
  usedBy: anyAudio,
  activate() {
    registerTimelinePart({ id: 'audio-side', slot: 'side', component: SoundSide });
    registerTimelinePart({ id: 'audio-main', slot: 'main', component: SoundMain });
    registerTimelinePart({ id: 'audio-button', slot: 'header', component: SoundButton, step: 'sound' });
    stops = [installAudio()];
    if (typeof window !== 'undefined') stops.push(installSoundDrop());
    // With ?debug in the page address (the screenshot script), let a script add a sound from bytes.
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')) {
      (window as unknown as { __framelingAudio: unknown }).__framelingAudio = { addSound: (bytes: number[], name: string, mime: string) => import('./ops').then((m) => m.addSound(new Uint8Array(bytes), name, mime)).then((c) => !!c) };
    }
  },
  // Sound stops the moment it is turned off: no voices left playing, no listeners left on the window.
  deactivate() {
    for (const s of stops) s();
    stops = [];
    delete (window as unknown as { __framelingAudio?: unknown }).__framelingAudio;
  },
});
