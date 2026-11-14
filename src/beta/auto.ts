/**
 * A beta build tells the makers when it falls over, without the tester having to notice and write it up.
 *
 * This only ever happens in a build that carries an ingest key, which is what being a beta build means, and only
 * while **Let me send reports to the makers** is on. It is on by default in a beta build and a tester can turn it
 * off in Preferences > Diagnostics at any time, and the panel and the testing page both say so plainly.
 *
 * It is kept narrow on purpose: crashes only, never anything you did. Nothing counts your strokes, your exports or
 * your time. A burst of errors becomes one report, and it gives up after a few so a build stuck in a loop cannot
 * sit there sending for ever.
 */
import { store } from '../core/store';
import { getPrefs } from '../ui/prefs';
import { gatherEnv } from '../tablet/check/state';
import { buildReport, docShape } from './report';
import { canSend, sendReport } from './send';
import { onProblem, recentProblems } from './problems';

/** How many automatic reports one run will ever send. */
export const AUTO_MAX = 5;
/** How long to wait after a problem, so a burst of them arrives as one report. */
export const AUTO_WAIT = 4000;

let sent = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * A run being driven by one of our own harnesses, which always opens the app with ?debug. Those runs are meant to
 * break things on purpose, so their problems are ours to read in the log, not reports for the board.
 */
const underHarness = (): boolean => typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

/** Whether an automatic report would go right now. */
export const autoOn = (): boolean => canSend() && !underHarness() && getPrefs().betaReports && sent < AUTO_MAX;

/** For the tests. */
export function forgetAuto(): void {
  sent = 0;
  if (timer) clearTimeout(timer);
  timer = null;
}

async function sendNow(): Promise<void> {
  timer = null;
  if (!autoOn()) return;
  sent += 1;
  const problems = recentProblems();
  if (!problems.length) return;
  const s = store().get();
  const report = buildReport({
    note: `Something went wrong by itself. ${problems.length === 1 ? 'One problem' : `${problems.length} problems`} while the app was open.`,
    contact: getPrefs().betaContact,
    where: 'sent by itself',
    env: (await gatherEnv()) as unknown as Record<string, unknown>,
    shape: docShape(s.doc),
    problems,
  });
  await sendReport({ ...report, kind: 'crash' });
}

/** Starts listening. Gives back the way to stop. */
export function startAuto(): () => void {
  const off = onProblem(() => {
    if (!autoOn() || timer) return;
    timer = setTimeout(() => void sendNow(), AUTO_WAIT);
  });
  return () => {
    off();
    if (timer) clearTimeout(timer);
    timer = null;
  };
}
