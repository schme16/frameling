// Whether the On air card (the queue, the counts and the Stop button, hanging from the pill) is open.
import { createStore } from '../ui/mini';

export const cardOpen = createStore(false);

export const showAudienceCard = (): void => cardOpen.set(true);
export const hideAudienceCard = (): void => cardOpen.set(false);

/** True when the desktop agreed to hear the Stop key from any window. False in a plain browser, on a desktop that says no, and while off. */
export const globalStop = createStore(false);
