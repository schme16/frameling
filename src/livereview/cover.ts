// When a reviewer's name and words must stay off the screen. While you are streaming, anybody watching your screen could
// read a name or a note that was never meant for them, so both stay covered until you press to read them: the same cover as a
// secret word (src/audience/spoilers.ts), and the same one answer about what your viewers can see.
//
// "Streaming" here is any of: Stream-safe is on, audience participation is on, or OBS is really going out. Pure, so the rule is
// tested without a screen.
import { coversFor } from '../audience/spoilers';

export interface StreamingNow {
  streamSafe: boolean;
  audienceOn: boolean;
  obsOnAir: boolean;
}

export const streamingNow = (s: StreamingNow): boolean => s.streamSafe || s.audienceOn || s.obsOnAir;

/**
 * Whether a reviewer's name and words are covered right now. Not streaming: plain. Streaming: covered, unless you said your
 * viewers see only the capture window (the answer "capture"), and an unanswered question counts as "screen".
 */
export const coverReviewers = (s: StreamingNow, viewAnswer: string | undefined): boolean => streamingNow(s) && coversFor(viewAnswer);

/** What a covered name shows instead: always the same, so even how long the name is stays private. */
export const COVERED_NAME = 'A reviewer';
/** What a covered pointer is called to a screen reader. */
export const COVERED_POINTER = 'A reviewer\'s pointer';
/** What the inbox says in place of covered words. */
export const coveredCount = (n: number): string => (n === 1 ? '1 new comment' : `${n} new comments`);
/** The small print under a covered comment. */
export const COVER_NOTE = 'Covered in case your viewers can see this window. Reading it puts it on screen.';
