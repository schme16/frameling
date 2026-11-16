// The remote door's request handling, as one pure function: a request in, an answer out. No sockets and no Electron
// here, so every rule (the key, the Origin refusal, the routes) is tested by calling it. The checks are the actions
// door's own (doorHandler.ts), on their own key.
//
//   GET  /v1                   hello: what this is, and what it can do
//   GET  /v1/state             where you are: frame, layer, selection, size, whether anything is in the way
//   GET  /v1/document          a summary of the open drawing: size, frames, layers, shape counts (no pictures, no file path)
//   GET  /v1/commands          every command the door may press, and whether each can run right now
//   POST /v1/commands/<id>     press one command (one Undo step)
//   POST /v1/run               { steps: [{ command } | { set }], label? }  a list of presses and choices, together one Undo step
//   POST /v1/script            { code, name? }  JavaScript, run in the same sandbox as the Scripts panel (one Undo step)
//
// Every request needs the key (`Authorization: Bearer <key>` or `X-Frameling-Key: <key>`), never in the address. A
// request that carries an Origin header comes from a web page and is refused before the key is looked at.
import { cleanAnswer, REMOTE_MAX_BODY, type RemoteAsk, type RemoteFault } from '../shared/remoteDoor';
import { fromAWebPage, hostOk, keyFrom, sameKey, type DoorRequest, type DoorResponse } from './doorHandler';

export const REMOTE_PREFIX = '/v1';

export interface RemoteDeps {
  /** The key now in force, read per request so a new one acts at once. */
  key(): string;
  /** Asks the page. May reject or never answer; the caller bounds the wait. */
  ask(op: RemoteAsk): Promise<unknown>;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}): DoorResponse => ({ status, headers, body });
const fault = (status: number, reason: RemoteFault, message: string, headers: Record<string, string> = {}): DoorResponse => json(status, { ok: false, reason, message }, headers);

const first = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

export async function handleRemoteRequest(req: DoorRequest, deps: RemoteDeps): Promise<DoorResponse> {
  try {
    if (fromAWebPage(req.headers)) return fault(403, 'origin-refused', 'Web pages cannot use the remote door.');
    if (!hostOk(first(req.headers.host), req.port)) return fault(403, 'host-refused', 'Use the address 127.0.0.1 with the port Frameling shows.');
    if (!sameKey(keyFrom(req.headers), deps.key())) return fault(401, 'unauthorized', 'Send the key from Frameling as "Authorization: Bearer <key>".', { 'WWW-Authenticate': 'Bearer' });

    let path: string;
    try {
      path = new URL(req.url, 'http://127.0.0.1').pathname.replace(/\/+$/, '');
    } catch {
      return fault(400, 'bad-request', 'That address could not be read.');
    }

    const forward = async (op: RemoteAsk): Promise<DoorResponse> => {
      const a = cleanAnswer(await deps.ask(op));
      if (!a) return fault(503, 'not-ready', 'Frameling did not answer. Is the drawing window open?');
      return json(a.status, a.body);
    };
    const onlyGet = (): DoorResponse | null => (req.method === 'GET' ? null : fault(405, 'method-not-allowed', 'Use GET for this one.', { Allow: 'GET' }));
    const onlyPost = (): DoorResponse | null => (req.method === 'POST' ? null : fault(405, 'method-not-allowed', 'Use POST for this one.', { Allow: 'POST' }));
    const readBody = (): { ok: true; value: unknown } | { ok: false; r: DoorResponse } => {
      if (req.body.length > REMOTE_MAX_BODY) return { ok: false, r: fault(413, 'too-large', 'That is more than the remote door takes in one request.') };
      if (req.body.trim() === '') return { ok: true, value: undefined };
      try {
        return { ok: true, value: JSON.parse(req.body) };
      } catch {
        return { ok: false, r: fault(400, 'bad-request', 'The body has to be JSON, or empty.') };
      }
    };

    if (path === REMOTE_PREFIX) return onlyGet() ?? (await forward({ op: 'hello' }));
    if (path === `${REMOTE_PREFIX}/state`) return onlyGet() ?? (await forward({ op: 'state' }));
    if (path === `${REMOTE_PREFIX}/document`) return onlyGet() ?? (await forward({ op: 'document' }));
    if (path === `${REMOTE_PREFIX}/commands`) return onlyGet() ?? (await forward({ op: 'commands' }));

    if (path.startsWith(`${REMOTE_PREFIX}/commands/`)) {
      const no = onlyPost();
      if (no) return no;
      let id: string;
      try {
        id = decodeURIComponent(path.slice(`${REMOTE_PREFIX}/commands/`.length));
      } catch {
        return fault(400, 'bad-request', 'That command name could not be read.');
      }
      if (!id || id.includes('/')) return fault(404, 'no-such-route', 'No such address.');
      return await forward({ op: 'run', body: { steps: [{ command: id }] } });
    }
    if (path === `${REMOTE_PREFIX}/run` || path === `${REMOTE_PREFIX}/script`) {
      const no = onlyPost();
      if (no) return no;
      const b = readBody();
      if (!b.ok) return b.r;
      return await forward(path.endsWith('/run') ? { op: 'run', body: b.value } : { op: 'script', body: b.value });
    }
    return fault(404, 'no-such-route', 'No such address. Try GET /v1.');
  } catch {
    // Never throws and never says why: a caller must not learn how the app is built.
    return fault(500, 'internal', 'Something went wrong inside Frameling.');
  }
}
