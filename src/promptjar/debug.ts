// Hooks for the shot scripts and local checks, only with ?debug in the page address (see src/renderer/debug.ts).
import { submitAudience } from '../audience';
import { addToJar, jar, pullOne } from './jar';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingJar: unknown }).__framelingJar = {
    submit: (text: string) => submitAudience('jar.add', { text }),
    // Straight in, with no cooldown, so a shot script can fill the jar quickly. The real way in is `submit`.
    add: (text: string) => addToJar(text),
    pull: () => pullOne(),
    state: () => jar.get(),
  };
}
