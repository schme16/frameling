// The remote door, the parts the desktop side (src/main) and the page (src/remotedoor) both need: the shapes they pass
// each other, the port, and what a page answer must look like before it is sent on. No Electron and no browser, so it is
// tested alone. The remote door is NOT the actions door (src/shared/streamDoor.ts): its own switch, its own key, its own port.

/** Where the door first looks for a port. Next to the actions door's, and just as unusual. */
export const REMOTE_DEFAULT_PORT = 47231;
/** When the port is busy and the person said "use the next free one", how many ports after it are tried. */
export const REMOTE_PORT_TRIES = 10;

export const validRemotePort = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1024 && n <= 65535;

/** What a caller may send. The body is JSON, and is never larger than this (a script of a few thousand lines fits). */
export const REMOTE_MAX_BODY = 128 * 1024;

/** What the desktop side asks the page. Reads are always answered; `run` and `script` change the drawing. */
export type RemoteAsk =
  | { op: 'hello' }
  | { op: 'state' }
  | { op: 'document' }
  | { op: 'commands' }
  | { op: 'run'; body: unknown }
  | { op: 'script'; body: unknown };

/** How long the desktop side waits for the page, by what was asked. A script may take a while (the sandbox stops it after a few seconds of silence). */
export const askTimeoutMs = (op: RemoteAsk['op']): number => (op === 'script' ? 30_000 : op === 'run' ? 20_000 : 4_000);

/** Reasons the door itself says no, before the page is asked. */
export type RemoteFault = 'origin-refused' | 'host-refused' | 'unauthorized' | 'no-such-route' | 'method-not-allowed' | 'bad-request' | 'too-large' | 'not-ready' | 'internal';

/** Reasons the page says no. `busy`: a stroke, a dialog or another run is in the way (try again). `refused`: not something the door may do, ever. */
export type RemoteReason = 'busy' | 'invalid' | 'refused' | 'failed' | 'closed';

/** What the page sends back: the HTTP status and a JSON body. Only these statuses are passed on. */
export interface RemoteAnswer {
  status: 200 | 400 | 403 | 409 | 422 | 503;
  body: Record<string, unknown>;
}

const STATUSES = new Set([200, 400, 403, 409, 422, 503]);

/** Checks what came back from the page is an answer. Anything else is null (the caller then hears "not ready"). */
export function cleanAnswer(v: unknown): RemoteAnswer | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as { status?: unknown; body?: unknown };
  if (typeof o.status !== 'number' || !STATUSES.has(o.status)) return null;
  if (!o.body || typeof o.body !== 'object' || Array.isArray(o.body)) return null;
  return { status: o.status as RemoteAnswer['status'], body: o.body as Record<string, unknown> };
}

/** What the settings screen needs to know. Never the key. */
export interface RemoteStatus {
  running: boolean;
  port: number;
  /** "http://127.0.0.1:47231" while running, else ''. */
  address: string;
  moved: boolean;
  problem: '' | 'port-busy' | 'failed';
}

export const closedRemote = (port: number = REMOTE_DEFAULT_PORT, problem: RemoteStatus['problem'] = ''): RemoteStatus => ({ running: false, port, address: '', moved: false, problem });
