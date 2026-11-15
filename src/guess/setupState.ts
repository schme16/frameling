// Whether the start-a-round box is open. Just that: the word being typed lives in the box and goes with it.
import { withChoice } from '../core/choices';
import { VIEW_CHOICE } from '../audience/spoilers';
import { createStore } from '../ui/mini';

export const guessSetupOpen = createStore<boolean>(false);
// The first time, it asks what your viewers can see before the box opens, because the word is about to be typed in it.
export const openGuessSetup = (): void => withChoice(VIEW_CHOICE, () => guessSetupOpen.set(true));
export const closeGuessSetup = (): void => guessSetupOpen.set(false);
