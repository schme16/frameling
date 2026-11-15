// The one vote that may be going, and what the screen shows about it. This is the only place that holds a vote.
//
// How long things live in memory, and where:
//   While a vote is open: its question and options, the counts, and one salted mark per voter (no ids, no names).
//   The moment it ends (the streamer ends it, its time runs out, Stop is pressed or audience features go off): the
//     salt and every mark are thrown away. Only the question, options and counts stay, so the result can be shown.
//   When the streamer closes the result: all of it is gone.
// Nothing here is written to the drawing, a file, the log, or anywhere that outlives the window. The only thing kept
// across runs is how long the streamer last let a vote run (see ./setup.ts), never a question, an option or a count.
import { audience, setAudienceOn } from '../audience';
import { currentChoice } from '../core/choices';
import { createStore } from '../ui/mini';
import { cleanSetup, createVote, type Vote, type VoteView, type Ways } from './tally';

export type VoteScreen = { phase: 'none' } | { phase: 'open' | 'result'; view: VoteView };

export const voteScreen = createStore<VoteScreen>({ phase: 'none' });

let vote: Vote | null = null;
let endTimer: ReturnType<typeof setTimeout> | null = null;
let publishTimer: ReturnType<typeof setTimeout> | null = null;

/** The two remembered answers, read fresh on every vote cast so a change in Preferences acts at once. */
export function currentWays(): Ways {
  return {
    again: currentChoice('votes.again') === 'latest' ? 'latest' : 'first',
    noId: currentChoice('votes.noId') === 'count' ? 'count' : 'refuse',
  };
}

export const currentVote = (): Vote | null => vote;
export const voteIsOpen = (): boolean => !!vote?.isOpen();
export const voteIsShowing = (): boolean => vote !== null;

function publish(): void {
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = null;
  if (!vote) return voteScreen.set({ phase: 'none' });
  voteScreen.set({ phase: vote.isOpen() ? 'open' : 'result', view: vote.view() });
}

/** Votes can arrive many a second; the screen is told at most every 100 ms, so it stays smooth. */
export function schedulePublish(): void {
  if (!publishTimer) publishTimer = setTimeout(publish, 100);
}

/** Shows what has been counted this very moment (tests, and the end of a vote). */
export const flushVotes = publish;

/** Starts a vote from what the streamer typed. One at a time. Says why not in plain words. */
export function startVote(raw: unknown): { ok: true } | { ok: false; reason: string } {
  if (vote) return { ok: false, reason: vote.isOpen() ? 'A vote is already going. End it first.' : 'Close the last result first.' };
  const cleaned = cleanSetup(raw);
  if (!cleaned.ok) return cleaned;
  const { setup } = cleaned;
  vote = createVote(setup, { now: () => Date.now() });
  if (setup.seconds !== null) endTimer = setTimeout(endVote, setup.seconds * 1000);
  publish();
  return { ok: true };
}

/** Ends the vote and shows the result. Frameling stops there: it never acts on it. */
export function endVote(): void {
  if (!vote?.isOpen()) return;
  if (endTimer) clearTimeout(endTimer);
  endTimer = null;
  vote.end(Date.now());
  publish();
}

/** Puts the vote or its result away. Everything about it is gone. */
export function closeVote(): void {
  if (endTimer) clearTimeout(endTimer);
  endTimer = null;
  vote?.end(Date.now());
  vote = null;
  publish();
}

/** Turns audience features on if they are off (asking how careful the first time), then runs `then`. A vote nobody can reach is no use. */
export function withAudienceOn(then: () => void): void {
  if (audience.isOn()) return then();
  setAudienceOn(true);
  // The first time, the question about how careful to be may be showing; go ahead once it is answered.
  if (audience.isOn()) return then();
  const off = audience.subscribe(() => {
    if (!audience.isOn()) return;
    off();
    then();
  });
}

/** Stop, or audience features going off, drops a vote that is going: nothing is left counting. Returns the way to stop watching. */
export function watchGate(): () => void {
  let lastOn = audience.isOn();
  let lastKills = audience.snapshot().counts.kills;
  return audience.subscribe(() => {
    const s = audience.snapshot();
    const stopped = (lastOn && !s.on) || s.counts.kills !== lastKills;
    lastOn = s.on;
    lastKills = s.counts.kills;
    if (stopped && vote?.isOpen()) closeVote();
  });
}

export function _resetVotesForTests(): void {
  closeVote();
  if (publishTimer) clearTimeout(publishTimer);
  publishTimer = null;
}
