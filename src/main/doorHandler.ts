// The actions door's request handling, as one pure function: a request in, an answer out. No sockets and no Electron
// here, so every rule (the key, the Origin refusal, what each verdict becomes) is tested by calling it.
//
//   GET  /v1/actions        what can be run right now           { ok, on, actions: [{ id, label, kind, cooldownMs, touchesDrawing, ready }] }
//   POST /v1/actions/<id>   run one; the body, if any, is JSON  the gate's verdict, as is: { ok: true, outcome: 'ran' | 'queued', position? }
//                                                                or { ok: false, reason, detail?, retryInMs?, say }
//                                                                (`detail` says why, when the action knows: closed, no-option, again...; `say` is a sentence for chat)
//
// Every request needs the key (`Authorization: Bearer <key>`, or `X-Frameling-Key: <key>`), never in the address. A
// request that carries an Origin header comes from a web page, and is refused before the key is even looked at.
import { createHash, timingSafeEqual } from 'node:crypto';
import { sayFor } from '../shared/doorSay';
import { cleanList, cleanVerdict, statusForVerdict, type DoorAsk, type DoorFault } from '../shared/streamDoor';

export interface DoorRequest {
  method: string;
  /** The path and query as received ("/v1/actions/door.message"). */
  url: string;
  /** Lower-case names, as node gives them. */
  headers: Record<string, string | string[] | undefined>;
  /** The body, as text ('' for none). */
  body: string;
  /** The port this door listens on (the Host header has to name it). */
  port: number;
}

export interface DoorResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface DoorDeps {
  /** The key now in force, read per request so a new one acts at once. */
  key(): string;
  /** Asks the page. May reject or never answer; the caller bounds the wait. */
  ask(op: DoorAsk): Promise<unknown>;
}

/** The most a request body may be, in characters. Payloads are a few words. */
export const MAX_BODY = 4096;
export const PREFIX = '/v1/actions';

const json = (status: number, body: unknown, headers: Record<string, string> = {}): DoorResponse => ({ status, headers, body });
const fault = (status: number, reason: DoorFault, message: string, headers: Record<string, string> = {}): DoorResponse => json(status, { ok: false, reason, message }, headers);

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

/** Compares two keys without leaking, by how long it takes, where they differ. */
export function sameKey(given: string, real: string): boolean {
  if (!given || !real) return false;
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(real).digest();
  return timingSafeEqual(a, b);
}

/** The key a request brought, from either header, or ''. */
export function keyFrom(headers: DoorRequest['headers']): string {
  const auth = first(headers.authorization);
  const m = /^Bearer\s+(\S+)\s*$/i.exec(auth);
  if (m) return m[1];
  return first(headers['x-frameling-key']).trim();
}

/** True when the Host header names this machine and this port. Stops a web page reaching the door by pointing its own name here. */
export function hostOk(host: string, port: number): boolean {
  if (!host) return true;
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

/** True for a request that came from a web page: it carries an Origin, or the browser says it is not a direct visit. */
export function fromAWebPage(headers: DoorRequest['headers']): boolean {
  if (headers.origin !== undefined) return true;
  const site = first(headers['sec-fetch-site']);
  return site !== '' && site !== 'none';
}

export async function handleDoorRequest(req: DoorRequest, deps: DoorDeps): Promise<DoorResponse> {
  try {
    if (fromAWebPage(req.headers)) return fault(403, 'origin-refused', 'Web pages cannot use the actions door.');
    if (!hostOk(first(req.headers.host), req.port)) return fault(403, 'host-refused', 'Use the address 127.0.0.1 with the port Frameling shows.');
    if (!sameKey(keyFrom(req.headers), deps.key())) return fault(401, 'unauthorized', 'Send the key from Frameling as "Authorization: Bearer <key>".', { 'WWW-Authenticate': 'Bearer' });

    let path: string;
    try {
      path = new URL(req.url, 'http://127.0.0.1').pathname;
    } catch {
      return fault(400, 'bad-request', 'That address could not be read.');
    }

    if (path === PREFIX || path === `${PREFIX}/`) {
      if (req.method !== 'GET') return fault(405, 'method-not-allowed', 'Use GET to list the actions.', { Allow: 'GET' });
      const list = cleanList(await deps.ask({ op: 'list' }));
      if (!list) return fault(503, 'not-ready', 'Frameling did not answer. Is the drawing window open?');
      return json(200, { ok: true, on: list.on, actions: list.actions });
    }

    if (path.startsWith(`${PREFIX}/`)) {
      if (req.method !== 'POST') return fault(405, 'method-not-allowed', 'Use POST to run an action.', { Allow: 'POST' });
      let id: string;
      try {
        id = decodeURIComponent(path.slice(PREFIX.length + 1));
      } catch {
        return fault(400, 'bad-request', 'That action name could not be read.');
      }
      if (!id || id.includes('/')) return fault(404, 'no-such-route', 'No such address.');
      if (req.body.length > MAX_BODY) return fault(413, 'too-large', 'That is more than an action needs.');
      let payload: unknown;
      if (req.body.trim() !== '') {
        try {
          payload = JSON.parse(req.body);
        } catch {
          return fault(400, 'bad-request', 'The body has to be JSON, or empty.');
        }
      }
      const verdict = cleanVerdict(await deps.ask({ op: 'run', id, payload }));
      if (!verdict) return fault(503, 'not-ready', 'Frameling did not answer. Is the drawing window open?');
      const headers: Record<string, string> = {};
      if (!verdict.ok && verdict.retryInMs !== undefined) headers['Retry-After'] = String(Math.max(1, Math.ceil(verdict.retryInMs / 1000)));
      // A refusal also carries a sentence a bot can say to chat. The status, `reason` and `retryInMs` are as before.
      return json(statusForVerdict(verdict), verdict.ok ? verdict : { ...verdict, say: sayFor(id, verdict) }, headers);
    }

    return fault(404, 'no-such-route', 'No such address. Try GET /v1/actions.');
  } catch {
    // Never throws and never says why: a caller must not learn how the app is built.
    return fault(500, 'internal', 'Something went wrong inside Frameling.');
  }
}
