// What a chat bot can say back to a viewer when the actions door turns a request away. The door adds one short sentence
// (`say`) to every refusal, next to the machine-readable `reason` and `detail`. No Electron and no browser, so it is tested alone.
//
// The sentences are about the request and the thing it joined, never about anybody else, and a guess is never said to be
// right or wrong: the details for a guess are only the ones that do not depend on the word.
import type { DoorVerdict } from './streamDoor';

type Refused = Extract<DoorVerdict, { ok: false }>;

/** The seconds to wait, as a bot would say them: at least 1, rounded up. */
export const waitSeconds = (retryInMs: number | undefined): number => Math.max(1, Math.ceil((retryInMs ?? 0) / 1000));

const secondsWord = (n: number): string => `${n} second${n === 1 ? '' : 's'}`;

/** What each action says for each detail it can give. Anything not here falls back to the sentence for the reason. */
const BY_ACTION: Record<string, Record<string, string>> = {
  'vote.cast': {
    closed: 'No vote is running right now.',
    'no-option': 'That is not one of the options.',
    'no-voter': 'Your vote could not be counted.',
    again: 'You have already voted.',
    full: 'This vote cannot take any more voters.',
  },
  'guess.send': {
    closed: 'No guessing round is running right now.',
    'no-guess': 'Say what you think it is.',
    'no-player': 'Your guess could not be counted.',
    again: 'You cannot guess any more this round.',
    full: 'This round cannot take any more players.',
  },
  'jar.add': {
    'no-prompt': 'Say what you would like drawn.',
    full: 'The prompt jar is full.',
    'channel-wait': 'The prompt jar just took one.',
  },
};

/** One sentence a bot can repeat to chat for a request the door turned away. Always something, never empty. */
export function sayFor(actionId: string, v: Refused): string {
  const own = v.detail ? BY_ACTION[actionId]?.[v.detail] : undefined;
  if (v.reason === 'queue-full') return 'Frameling is busy right now. Try again in a moment.';
  if (v.reason === 'cooldown') {
    const wait = v.retryInMs === undefined ? '' : ` Try again in ${secondsWord(waitSeconds(v.retryInMs))}.`;
    return `${own ?? 'That was too soon after the last one.'}${wait}`;
  }
  if (own) return own;
  switch (v.reason) {
    case 'off':
      return 'Frameling is not taking requests from chat right now.';
    case 'unknown':
      return 'Frameling does not know that action.';
    case 'unavailable':
      return 'That is not switched on in Frameling.';
    default:
      return 'Frameling could not use that.';
  }
}
