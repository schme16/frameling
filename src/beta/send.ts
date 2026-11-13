/**
 * Sending a report to the board's Reports tab.
 *
 * The key is a write-only ingest key: it can add a report and nothing else. It cannot read the board, the tasks, the
 * hand-offs or the docs, and it cannot read back a report it has written. It is put into the build from the
 * environment at build time (FRAMELING_INGEST_KEY) and is never in the repository. A build without one simply has no
 * Send button, and saving a file to send by hand still works.
 */
import type { IngestReport } from './report';
import { reportFits, reportText } from './report';

declare const __FRAMELING_INGEST__: { url: string; key: string } | undefined;

export interface Ingest {
  url: string;
  key: string;
}

/** The build's ingest settings, or null when this build was made without a key (which is every ordinary build). */
export function ingest(): Ingest | null {
  const v = typeof __FRAMELING_INGEST__ === 'undefined' ? undefined : __FRAMELING_INGEST__;
  return v?.key && v?.url ? v : null;
}

/** Whether this build can send at all. */
export const canSend = (): boolean => !!ingest();

export type SendOutcome =
  | { ok: true }
  | { ok: false; why: 'no-key' | 'too-big' | 'too-often' | 'refused' | 'offline' | 'unreachable' | 'failed'; detail?: string };

/** Plain words for each way it can go wrong. */
export const SEND_WORDS: Record<Exclude<SendOutcome & { ok: false }, { ok: true }>['why'], string> = {
  'no-key': "This build can't send reports. Save the file instead and send it however you like.",
  'too-big': 'That report is too big to send. Shorten the note and try again.',
  'too-often': 'That is a lot of reports in a short while. Have a cup of tea and try again in a few minutes.',
  refused: 'The board turned the report away. The key in this build may have been changed.',
  offline: "No connection, so it couldn't go. It will not be sent by itself later: press Send again when you're back.",
  unreachable: "Couldn't reach the board. It will not try again by itself: press Send when you want to.",
  failed: "That didn't go through. Save the file instead and send it however you like.",
};

/** Is the key this build carries still good? Asks the board without sending anything. */
export async function checkKey(fetcher: typeof fetch = fetch): Promise<boolean> {
  const i = ingest();
  if (!i) return false;
  try {
    const r = await fetcher(`${i.url}/api/ingest`, { headers: { Authorization: `Bearer ${i.key}` } });
    if (!r.ok) return false;
    const body = (await r.json()) as { ok?: boolean };
    return body?.ok === true;
  } catch {
    return false;
  }
}

/** Sends one report. Never called on its own: only ever from the button the person presses. */
export async function sendReport(report: IngestReport, fetcher: typeof fetch = fetch): Promise<SendOutcome> {
  const i = ingest();
  if (!i) return { ok: false, why: 'no-key' };
  if (!reportFits(report)) return { ok: false, why: 'too-big' };
  let r: Response;
  try {
    r = await fetcher(`${i.url}/api/ingest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${i.key}`, 'Content-Type': 'application/json' },
      body: reportText(report),
    });
  } catch {
    // A thrown fetch is either no connection or something in the way (a policy, a proxy). Saying "no connection"
    // when there plainly is one sends people off checking their wifi for nothing.
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    return { ok: false, why: online ? 'unreachable' : 'offline' };
  }
  if (r.ok) return { ok: true };
  if (r.status === 429) return { ok: false, why: 'too-often' };
  if (r.status === 401 || r.status === 403) return { ok: false, why: 'refused' };
  if (r.status === 413) return { ok: false, why: 'too-big' };
  return { ok: false, why: 'failed', detail: `${r.status}` };
}
