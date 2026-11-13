// Hooks for the shot scripts and local checks, only with ?debug in the page address (see src/renderer/debug.ts).
import { FRESH_PET } from './model';
import { paintQuills, plainQuills } from './quills';
import { petStore, setPet, tellQuill } from './store';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingQuillPet: unknown }).__framelingQuillPet = {
    get: () => petStore.get(),
    set: setPet,
    fresh: () => setPet(FRESH_PET),
    tell: tellQuill,
    paint: paintQuills,
    plain: plainQuills,
  };
}
