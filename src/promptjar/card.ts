// Whether the jar's card is open, and whether the jar is switched on (the feature is registered). Words are never in here.
import { createStore } from '../ui/mini';

export const jarCardOpen = createStore(false);
/** True while the feature is on, so the title bar chip can come and go with it. */
export const jarFeatureOn = createStore(false);
/** Bumped to ask the card to put the cursor in its "add your own" box. */
export const jarFocusAdd = createStore(0);

export const showJar = (): void => jarCardOpen.set(true);
export const hideJar = (): void => jarCardOpen.set(false);
