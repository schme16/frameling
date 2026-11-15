// The one thing the audience can do here: cast a vote. It goes through the audience gate like everything else, so the
// switch, the allowlist and Stop apply, and the actions door lists it with nothing more to do.
//
// What a request looks like (the body of `POST /v1/actions/vote.cast`):
//   { "option": 2, "voter": "12345678" }
//   option  the place of the option (1 is the first), or its words ("red")
//   voter   who is voting, as an id the streamer's tool already has (Twitch's user id, not the name), so a person's
//           second vote can be told from a new voter. It is turned into a salted mark here and never kept.
// A name, a message or anything else in the body is never read.
//
// It is view-only (`touchesDrawing` is left out), so the gate gives it no way to reach the document at all.
import { registerAudienceAction } from '../audience';
import { currentVote, currentWays, schedulePublish } from './state';
import type { Prepared, Vote } from './tally';

export const VOTE_ACTION = 'vote.cast';

interface Cast {
  vote: Vote;
  prepared: Prepared;
}

/** Checks a request against the vote that is going. Null (the gate says "invalid") when there is none, the option is not one of its options, the voter has no id (unless that is allowed) or has voted already. */
export function parseCast(raw: unknown): Cast | null {
  const vote = currentVote();
  if (!vote?.isOpen()) return null;
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : { option: raw };
  // Only `option` and `voter` are read. Everything else in the body is ignored, unread.
  const prepared = vote.prepare(body.option, body.voter, currentWays());
  if (typeof prepared === 'string') {
    schedulePublish();
    return null;
  }
  return { vote, prepared };
}

export function registerVoteAction(): void {
  registerAudienceAction<Cast>({
    id: VOTE_ACTION,
    label: 'Cast a vote',
    kind: 'vote',
    // A vote is many small requests at once and each is only counted, so it is paced by the gate's per-second ceiling, not the usual cooldown.
    cooldown: 0,
    bulk: true,
    parse: parseCast,
    run: ({ vote, prepared }) => {
      vote.cast(prepared, currentWays());
      schedulePublish();
    },
  });
}
