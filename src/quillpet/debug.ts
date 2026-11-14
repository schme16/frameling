// Hooks for the shot scripts and local checks, only with ?debug in the page address (see src/renderer/debug.ts).
import { FRESH_PET } from './model';
import { paintQuills, plainQuills } from './quills';
import { petStore, setPet, tellQuill, keepPresent } from './store';
import { makePresent, openPresentDoc, tryPresent } from './gifts';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingQuillPet: unknown }).__framelingQuillPet = {
    get: () => petStore.get(),
    set: setPet,
    fresh: () => setPet(FRESH_PET),
    tell: tellQuill,
    paint: paintQuills,
    plain: plainQuills,
    // Presents: make one on the spot (for the help pictures), or run the real "would he?" check.
    present: async () => {
      const p = await makePresent(petStore.get(), Date.now());
      if (p) keepPresent(p);
      return !!p;
    },
    tryPresent,
    openPresent: openPresentDoc,
  };
}
