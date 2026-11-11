// Sound: import, timeline rows, playback and scrubbing, export. Registers its commands, choices and help topics.
import './choices';
import './commands';
import './help';
import { installAudio } from './engine';
import { installSoundDrop } from './drop';

installAudio();
if (typeof window !== 'undefined') installSoundDrop();

export { addSound, importSound } from './ops';

// With ?debug in the page address (the screenshot script), let a script add a sound from bytes.
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')) {
  (window as unknown as { __framelingAudio: unknown }).__framelingAudio = { addSound: (bytes: number[], name: string, mime: string) => import('./ops').then((m) => m.addSound(new Uint8Array(bytes), name, mime)).then((c) => !!c) };
}
