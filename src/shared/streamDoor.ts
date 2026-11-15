// The actions door, the parts the desktop side (src/main) and the page (src/streamdoor) both need: the shapes they pass
// each other, the port, and how a gate verdict becomes an HTTP answer. No Electron, no browser, so it is tested alone.

/** Where the door first looks for a port. Unusual enough that nothing else is likely to hold it. */
export const DEFAULT_DOOR_PORT = 47213;
/** When the port is busy and the person said "use the next free one", how many ports after it are tried. */
export const DOOR_PORT_TRIES = 10;

/** Is this a port a person could have typed? Ports below 1024 need special rights, so they are not offered. */
export const validDoorPort = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1024 && n <= 65535;

/** What a caller sees for one action (only the ones the gate says are available right now are listed). */
export interface DoorAction {
  id: string;
  label: string;
  kind: string;
  /** How long after one of this kind runs before another is taken, with the streamer's strictness already applied. */
  cooldownMs: number;
  touchesDrawing: boolean;
}

/** What the gate said, in the shape the page sends back. The same as the gate's Verdict. */
export type DoorVerdict =
  | { ok: true; outcome: 'ran' }
  | { ok: true; outcome: 'queued'; position: number }
  | { ok: false; reason: 'off' | 'unknown' | 'unavailable' | 'invalid' | 'cooldown' | 'queue-full'; retryInMs?: number };

/** What the desktop side asks the page. */
export type DoorAsk = { op: 'list' } | { op: 'run'; id: string; payload?: unknown };

export interface DoorList {
  on: boolean;
  actions: DoorAction[];
}

/** Reasons the door itself says no, before the gate is asked. */
export type DoorFault = 'origin-refused' | 'host-refused' | 'unauthorized' | 'no-such-route' | 'method-not-allowed' | 'bad-request' | 'too-large' | 'not-ready' | 'internal';

/** What the settings screen needs to know. Never the key. */
export interface DoorStatus {
  running: boolean;
  /** The port in use, or the one that was wanted when it could not open. */
  port: number;
  /** "http://127.0.0.1:47213" while running, else ''. */
  address: string;
  /** The wanted port was busy and the next free one was used instead. */
  moved: boolean;
  /** Why it is not running, when it was asked to and could not. */
  problem: '' | 'port-busy' | 'failed';
}

export const closedStatus = (port: number = DEFAULT_DOOR_PORT, problem: DoorStatus['problem'] = ''): DoorStatus => ({ running: false, port, address: '', moved: false, problem });

/** The HTTP status for what the gate said. A caller can tell every reason apart by the `reason` in the body as well. */
export function statusForVerdict(v: DoorVerdict): number {
  if (v.ok) return v.outcome === 'queued' ? 202 : 200;
  switch (v.reason) {
    case 'unknown':
      return 404;
    case 'unavailable':
      return 403;
    case 'invalid':
      return 400;
    case 'cooldown':
    case 'queue-full':
      return 429;
    case 'off':
      return 503;
  }
}

const REASONS = new Set(['off', 'unknown', 'unavailable', 'invalid', 'cooldown', 'queue-full']);

/** Checks what came back from the page is a verdict, and keeps only its known fields. Anything else is null. */
export function cleanVerdict(v: unknown): DoorVerdict | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  if (o.ok === true) {
    if (o.outcome === 'ran') return { ok: true, outcome: 'ran' };
    if (o.outcome === 'queued' && typeof o.position === 'number' && Number.isFinite(o.position)) return { ok: true, outcome: 'queued', position: o.position };
    return null;
  }
  if (o.ok === false && typeof o.reason === 'string' && REASONS.has(o.reason)) {
    const reason = o.reason as Extract<DoorVerdict, { ok: false }>['reason'];
    return typeof o.retryInMs === 'number' && Number.isFinite(o.retryInMs) ? { ok: false, reason, retryInMs: Math.max(0, Math.round(o.retryInMs)) } : { ok: false, reason };
  }
  return null;
}

/** Checks the list the page sent back. Null when it is not one. */
export function cleanList(v: unknown): DoorList | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as { on?: unknown; actions?: unknown };
  if (typeof o.on !== 'boolean' || !Array.isArray(o.actions)) return null;
  const actions: DoorAction[] = [];
  for (const a of o.actions) {
    if (!a || typeof a !== 'object') return null;
    const x = a as Record<string, unknown>;
    if (typeof x.id !== 'string' || typeof x.label !== 'string' || typeof x.kind !== 'string' || typeof x.cooldownMs !== 'number') return null;
    actions.push({ id: x.id, label: x.label, kind: x.kind, cooldownMs: x.cooldownMs, touchesDrawing: x.touchesDrawing === true });
  }
  return { on: o.on, actions };
}
