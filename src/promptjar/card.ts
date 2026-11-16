// Whether the jar's card is open, and whether the jar is switched on (the feature is registered). Words are never in here.
import { createStore } from '../ui/mini';

export const jarCardOpen = createStore(false);
/** True while the feature is on, so the title bar chip can come and go with it. */
export const jarFeatureOn = createStore(false);
/** Bumped to ask the card to put the cursor in its "add your own" box. */
export const jarFocusAdd = createStore(0);

export const showJar = (): void => jarCardOpen.set(true);
// Closing the card covers the prompt in hand again, so opening it later never shows it by surprise.
export const hideJar = (): void => {
  jarCardOpen.set(false);
  jarRead.set(null);
};

/**
 * The id of the pulled slip the streamer has read, when it was covered ("Read it"). Only an id, never the words. A new
 * pull is a new id, so every prompt starts covered again.
 */
export const jarRead = createStore<number | null>(null);

/**
 * The id of the pulled slip the streamer has sent to the stream overlay ("Send to the overlay"). Only an id, never the
 * words. A new pull is a new id, so it starts unsent.
 */
export const jarShown = createStore<number | null>(null);
