// Hooks for the shot scripts and local checks, only with ?debug in the page address (see src/renderer/debug.ts).
import { dayKey, FRESH_PET } from './model';
import { paintQuills, plainQuills } from './quills';
import { petStore, setPet, tellQuill, keepPresent } from './store';
import { seeded } from './potter';
import { forgetReturn, settleIn } from './welcome';
import { makePresent, openPresentDoc, tryPresent } from './gifts';

const dayOf = (ms: number): string => dayKey(ms);

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
    // Come back after `days` away, as the real start-up would: for the help pictures and the checks. Nothing keeps the number.
    comeBack: (days: number, seed = 7) => {
      const at = Date.now();
      const pet = petStore.get();
      forgetReturn();
      setPet({ ...pet, lastDay: days > 0 ? dayOf(at - days * 86400000) : dayOf(at), lately: undefined });
      settleIn(at, seeded(seed));
    },
    openPresent: openPresentDoc,
  };
}
