// Hooks for the shot scripts and local checks, only with ?debug in the page address (see src/renderer/debug.ts).
import { submitAudience } from '../audience';
import { closeVote, endVote, flushVotes, startVote } from './state';

if (typeof window !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __framelingVotes: unknown }).__framelingVotes = {
    start: startVote,
    end: endVote,
    close: closeVote,
    flush: flushVotes,
    /** Pretend voters, for a clip: `n` different people, each choosing by `pick(i)` (1-based option). Goes through the real gate. */
    crowd: (n: number, pick: (i: number) => number, from = 0) => {
      for (let i = from; i < from + n; i++) submitAudience('vote.cast', { option: pick(i), voter: `demo-${i}` });
    },
    cast: (option: number, voter: string) => submitAudience('vote.cast', { option, voter }),
  };
}
