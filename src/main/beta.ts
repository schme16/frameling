// Sends a beta report for the page, through Electron's own network stack. The page's fetch can only say "Failed to
// fetch" for everything; this side sees the real reason (DNS, certificate, proxy, blocked) and hands it back as a
// code. It will only ever talk to the one board this build was made for, and only to its two report addresses.
import { net } from 'electron';
import { mayReach, netCode, type Reply } from '../beta/outcome';

declare const __FRAMELING_INGEST_ORIGIN__: string | undefined;
const ORIGIN = typeof __FRAMELING_INGEST_ORIGIN__ === 'undefined' ? '' : __FRAMELING_INGEST_ORIGIN__;

type Handle = (channel: string, fn: (e: unknown, ...args: any[]) => unknown) => void;

interface Req {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

/** How long to wait for the board before saying so. */
export const BETA_TIMEOUT_MS = 20000;

export async function betaRequest(req: Req, origin: string = ORIGIN, doFetch: typeof net.fetch = (u, i) => net.fetch(u, i), timeoutMs: number = BETA_TIMEOUT_MS): Promise<Reply> {
  if (!req || !mayReach(req.url, origin)) return { code: 'ERR_BLOCKED_BY_CLIENT', message: 'Not an address this build sends to.' };
  const method = req.method === 'POST' ? 'POST' : 'GET';
  const headers: Record<string, string> = {};
  for (const k of ['Authorization', 'Content-Type']) if (typeof req.headers?.[k] === 'string') headers[k] = req.headers[k];
  try {
    const r = await doFetch(req.url, { method, headers, body: method === 'POST' && typeof req.body === 'string' ? req.body : undefined, signal: AbortSignal.timeout(timeoutMs) });
    return { status: r.status, type: r.headers.get('content-type') ?? '', text: (await r.text()).slice(0, 4000) };
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    if (name === 'TimeoutError' || name === 'AbortError') return { code: 'TIMEOUT' };
    return { code: netCode(e) || 'FETCH_FAILED', message: String((e as Error)?.message ?? e).slice(0, 200) };
  }
}

export function registerBetaIpc(handle: Handle): void {
  handle('beta:request', (_e, req: Req) => betaRequest(req));
}
