// Reads what is going on from the real stores and hands it to the pure side (tiles.ts, model.ts) as a Situation.
import { audience } from '../audience';
import { dareScreen } from '../dares/fx';
import { rememberedChoice } from '../core/choices';
import { streamSafe } from '../core/streamSafe';
import { guessScreen } from '../guess/state';
import { isCaptureOpen } from '../popout/link';
import { jar } from '../promptjar/jar';
import { voteScreen } from '../votes/state';
import { VIEW_CHOICE } from '../audience/spoilers';
import type { Situation } from './tiles';

/** True while turning audience participation on would stop to ask a first-time question. */
export const audienceWouldAsk = (): boolean => rememberedChoice('audience.strictness') === undefined || rememberedChoice(VIEW_CHOICE) === undefined;

export function readSituation(): Situation {
  const snap = audience.snapshot();
  const v = voteScreen.get();
  const g = guessScreen.get();
  const j = jar.get();
  const d = dareScreen.get();
  return {
    vote: v.phase,
    voteTotal: v.phase === 'none' ? 0 : v.view.total,
    guess: g.phase,
    guessPlayers: g.phase === 'none' ? 0 : g.view.players,
    hintsLeft: g.phase === 'open' ? g.view.hintsLeft : 0,
    jarCount: j.slips.length,
    jarHand: j.hand !== null,
    audienceOn: snap.on,
    drawingAllowed: snap.drawingAllowed,
    waiting: snap.queue.length,
    daresGoing: d.held.length > 0 || !!d.banner || !!d.countdown,
    penModOn: d.held.some((h) => h.resource === 'pen'),
    streamSafe: streamSafe(),
    captureOpen: isCaptureOpen(),
    asks: audienceWouldAsk(),
  };
}
