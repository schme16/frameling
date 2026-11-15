// Hooks for the shot scripts and local checks, only with ?debug in the page address (see src/renderer/debug.ts).
import { submitAudience } from '../audience';
import { setChoice } from '../core/choices';
import { closeRound, endRound, flushRound, giveHint, startRound } from './state';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingGuess: unknown }).__framelingGuess = {
    start: startRound,
    end: endRound,
    close: closeRound,
    hint: giveHint,
    flush: flushRound,
    /** Whether the winner's name shows in the result, for a clip. */
    names: (on: boolean) => setChoice('guess.winnerName', on ? 'show' : 'hide'),
    /** A pretend guesser, going through the real gate (the same call the actions door makes). */
    guess: (guess: string, player: string, name?: string) => submitAudience('guess.send', { guess, player, ...(name ? { name } : {}) }),
  };
}
