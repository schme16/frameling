// The one thing the audience can do here: send a guess. It goes through the audience gate like everything else, so the
// switch, the allowlist and Stop apply, and the actions door lists it with nothing more to do.
//
// What a request looks like (the body of `POST /v1/actions/guess.send`):
//   { "guess": "a cat", "player": "12345678", "name": "Ann" }
//   guess   what they think it is (cleaned like all text from chat: plain words, cut short)
//   player  who is guessing, as an id the streamer's tool already has (Twitch's user id, not the name), so one person's
//           guesses can be counted and a person who got it can be told from a new guesser. It is turned into a salted
//           mark here and never kept.
//   name    optional. Only read from a guess that is right, and only when you chose to show winners' names.
// Anything else in the body is ignored, unread.
//
// It never says whether a guess was right: the door answers "ran" for a right guess and a wrong one alike, so nobody
// can use it to test words. It is view-only (`touchesDrawing` is left out), so the gate gives it no way to reach the
// document at all.
import { refusal, registerAudienceAction, type Refusal } from '../audience';
import { afterGuess, currentRound, namesAllowed, schedulePublish } from './state';
import type { Prepared, Round, Turned } from './round';

export const GUESS_ACTION = 'guess.send';

interface Sent {
  round: Round;
  prepared: Prepared;
}

/**
 * Why a guess was turned away, as the short word the door passes on. A person who has already got it and one who has used
 * up their guesses both hear `again`, so the door never says a word was right.
 */
export const guessDetail = (t: Turned): string => (t === 'solved' || t === 'too-many' ? 'again' : t);

/** Checks a request against the round that is going. A refusal (the gate says "invalid", with the reason as `detail`) when there is none, the guess is empty or too odd, the player has no id, or has used up their guesses or already got it. */
export function parseGuess(raw: unknown): Sent | Refusal | null {
  const round = currentRound();
  if (!round?.isOpen()) return refusal(guessDetail('closed'));
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : { guess: raw };
  const prepared = round.prepare(body.guess, body.player, body.name, { names: namesAllowed() });
  if (typeof prepared === 'string') {
    schedulePublish();
    return refusal(guessDetail(prepared));
  }
  return { round, prepared };
}

export function registerGuessAction(): void {
  registerAudienceAction<Sent>({
    id: GUESS_ACTION,
    label: 'Send a guess',
    kind: 'guess',
    // A round is many small requests at once and each is only counted, so it is paced by the gate's per-second ceiling, not the usual cooldown.
    cooldown: 0,
    bulk: true,
    parse: parseGuess,
    ready: () => !!currentRound()?.isOpen(),
    run: ({ round, prepared }) => {
      const result = round.cast(prepared);
      if (result === 'right' || result === 'wrong') afterGuess(result);
      else schedulePublish();
    },
  });
}
