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
import { BOARD_HOST, outcomeOf, SEND_WORDS, sayFailure, type Failure, type Reply, type SendOutcome } from './outcome';
import type { FramelingApi } from '../preload/api';

export { SEND_WORDS, sayFailure };
export type { SendOutcome };

declare const __FRAMELING_INGEST__: { url: string; key: string } | undefined;

/**
 * The testers' page: everything a beta tester needs, on one page that needs no login. Public, read-only, and the
 * only page the link opens. Written as the board doc `beta-testing` and shared from the board.
 */
export const BETA_PAGE = 'https://project-boards.shanegadsby.com/s/qUR_fOzbJGN9T1_ItQ3HEJ6u';

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

/** The board a build with no key would still be checked against (nothing is sent to it, only asked if it is there). */
export const BOARD_URL = `https://${BOARD_HOST}`;

/** Makes one request and says what came back, or the code of what stopped it. */
export type Transport = (url: string, init: { method: 'GET' | 'POST'; headers?: Record<string, string>; body?: string }) => Promise<Reply>;

/** How long the page's own fetch waits before giving up and saying so. */
export const WAIT_MS = 20000;

/** The page's own fetch, with a time limit. It cannot tell why it failed, so the code says only that it did. */
export const fetchTransport =
  (fetcher: typeof fetch = fetch): Transport =>
  async (url, init) => {
    try {
      const r = await fetcher(url, { ...init, signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(WAIT_MS) : undefined });
      return { status: r.status, type: r.headers.get('content-type') ?? '', text: (await r.text()).slice(0, 4000) };
    } catch (e) {
      const name = (e as { name?: string } | null)?.name;
      return { code: name === 'TimeoutError' || name === 'AbortError' ? 'TIMEOUT' : 'FETCH_FAILED', message: String((e as Error)?.message ?? e).slice(0, 200) };
    }
  };

/** In the desktop app the request is made by the desktop side, which can see the real reason; elsewhere, by the page. */
export function defaultTransport(): Transport {
  const bridge = typeof window !== 'undefined' ? (window as { frameling?: FramelingApi }).frameling?.beta : undefined;
  if (!bridge) return fetchTransport();
  return async (url, init) => {
    try {
      return await bridge.request({ url, ...init });
    } catch (e) {
      return { code: 'FETCH_FAILED', message: String((e as Error)?.message ?? e).slice(0, 200) };
    }
  };
}

const online = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

/** Is the board there, and is the key this build carries accepted? Sends no report. Says which of the two failed. */
export async function checkBoard(transport: Transport = defaultTransport()): Promise<SendOutcome & { stage?: 'board' | 'key' }> {
  const i = ingest();
  if (!i) return { ok: false, why: 'no-key' };
  const alive = await transport(`${i.url}/api/health`, { method: 'GET' });
  const first = outcomeOf(alive, online());
  if (!first.ok) return { ...first, stage: 'board' };
  const key = await transport(`${i.url}/api/ingest`, { method: 'GET', headers: { Authorization: `Bearer ${i.key}` } });
  const second = outcomeOf(key, online());
  return second.ok ? { ok: true } : { ...second, stage: 'key' };
}

/** Is the key this build carries still good? Asks the board without sending anything. */
export async function checkKey(transport: Transport = defaultTransport()): Promise<boolean> {
  const i = ingest();
  if (!i) return false;
  const r = await transport(`${i.url}/api/ingest`, { method: 'GET', headers: { Authorization: `Bearer ${i.key}` } });
  return outcomeOf(r, online()).ok;
}

/** Sends one report. Never called on its own: only ever from the button the person presses (or a crash, in a beta build). */
export async function sendReport(report: IngestReport, transport: Transport = defaultTransport()): Promise<SendOutcome> {
  const i = ingest();
  if (!i) return { ok: false, why: 'no-key' };
  if (!reportFits(report)) return { ok: false, why: 'too-big' };
  const reply = await transport(`${i.url}/api/ingest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${i.key}`, 'Content-Type': 'application/json' },
    body: reportText(report),
  });
  const out = outcomeOf(reply, online());
  lastFailure = out.ok ? null : out;
  return out;
}

let lastFailure: Failure | null = null;
/** How the last report went wrong, if it did (a crash report goes by itself, so the person never saw it fail). Kept in memory only. */
export const lastSendFailure = (): Failure | null => lastFailure;
