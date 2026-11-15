// Whether the start-a-round box is open. Just that: the word being typed lives in the box and goes with it.
import { createStore } from '../ui/mini';

export const guessSetupOpen = createStore<boolean>(false);
export const openGuessSetup = (): void => guessSetupOpen.set(true);
export const closeGuessSetup = (): void => guessSetupOpen.set(false);
