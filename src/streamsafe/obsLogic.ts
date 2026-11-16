// Going live with OBS: the parts that are plain decisions, with no window, no network and no timer, so they can be tested
// on their own. The page's controller (obsLink.ts) and the desktop side (src/main/obsSession.ts) both use them.
// Nothing here may import the page or Electron: the desktop side bundles this file too.

/** Where OBS listens unless it was told otherwise (OBS > Tools > WebSocket Server Settings). */
export const OBS_DEFAULT_ADDRESS = 'localhost:4455';

export type ObsAddress = { ok: true; host: string; port: number; url: string } | { ok: false; why: string };

const isPrivateV4 = (h: string): boolean => {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const [a, b, c, d] = m.slice(1).map(Number);
  if ([a, b, c, d].some((n) => n > 255)) return false;
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
};

/** Frameling only talks to OBS on your own computer or your own network, never to the internet. */
export function isOwnNetwork(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '::1' || isPrivateV4(h) || (h.endsWith('.local') && h.length > 6) || /^fe80:/.test(h) || /^f[cd][0-9a-f]{2}:/.test(h);
}

/**
 * Reads what was typed in the address box: "localhost:4455", "192.168.1.20", "ws://pc.local:4456". The port is
 * optional (4455 is OBS's own). Anything that is not your own computer or network is turned away with a plain reason.
 */
export function parseObsAddress(text: string): ObsAddress {
  const raw = text.trim().replace(/^wss?:\/\//i, '').replace(/\/+$/, '');
  if (!raw) return { ok: false, why: 'Type the address OBS shows, such as localhost:4455.' };
  if (/[\s/?#@]/.test(raw)) return { ok: false, why: 'That does not look like an address. Try localhost:4455.' };
  let host = raw;
  let port = 4455;
  const v6 = /^\[([^\]]+)\](?::(\d+))?$/.exec(raw);
  if (v6) {
    host = v6[1];
    if (v6[2]) port = Number(v6[2]);
  } else if ((raw.match(/:/g) ?? []).length === 1) {
    const [h, p] = raw.split(':');
    host = h;
    if (!/^\d+$/.test(p)) return { ok: false, why: 'The part after the colon should be a number, such as 4455.' };
    port = Number(p);
  } else if ((raw.match(/:/g) ?? []).length > 1) {
    host = raw;
  }
  if (!host) return { ok: false, why: 'Type the address OBS shows, such as localhost:4455.' };
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, why: 'The port should be a number from 1 to 65535. OBS usually uses 4455.' };
  if (!isOwnNetwork(host)) return { ok: false, why: 'Frameling only talks to OBS on your own computer or your own network, not over the internet.' };
  return { ok: true, host, port, url: `ws://${host.includes(':') ? `[${host}]` : host}:${port}` };
}

/**
 * What an OBS output state says about whether you are on air (or recording). Starting counts as on, so Stream-safe is
 * up before the first picture goes out; Stopping returns undefined, because it is still on until it says Stopped.
 */
export function outputActive(state: string): boolean | undefined {
  switch (state) {
    case 'OBS_WEBSOCKET_OUTPUT_STARTING':
    case 'OBS_WEBSOCKET_OUTPUT_STARTED':
    case 'OBS_WEBSOCKET_OUTPUT_RECONNECTING':
    case 'OBS_WEBSOCKET_OUTPUT_RECONNECTED':
    case 'OBS_WEBSOCKET_OUTPUT_PAUSED':
    case 'OBS_WEBSOCKET_OUTPUT_RESUMED':
      return true;
    case 'OBS_WEBSOCKET_OUTPUT_STOPPED':
      return false;
    default:
      return undefined;
  }
}

/** Why a try at reaching OBS did not work. Only `password` needs the person; the rest is OBS not being there yet. */
export type ObsFailure = 'unreachable' | 'password' | 'refused' | 'address';

/** Sorts what went wrong (an error from the websocket library or the network) into one of the reasons above. */
export function classifyFailure(err: unknown): ObsFailure {
  const e = err as { code?: unknown; message?: unknown } | null;
  const code = e?.code;
  const message = String(e?.message ?? '');
  // obs-websocket closes with 4009 when the password is wrong or missing.
  if (code === 4009 || /authentication failed/i.test(message)) return 'password';
  // 4010 an unsupported protocol version, 4011 the session was invalidated, 4012 and up are about requests.
  if (typeof code === 'number' && code >= 4000) return 'refused';
  return 'unreachable';
}

/** `password` and `address` wait for the person (nothing will fix them by itself); `waiting` is OBS simply not being there yet. */
export type ObsLinkState = 'off' | 'connecting' | 'connected' | 'waiting' | 'password' | 'address';

export interface ObsState {
  link: ObsLinkState;
  streaming: boolean;
  recording: boolean;
  /** Stream-safe is on right now (the controller keeps this up to date). */
  safe: boolean;
  /** Frameling switched Stream-safe on for this broadcast, so it is the one to offer to switch it off. */
  owns: boolean;
  /** Tries in a row that found no OBS, for the waiting between them. */
  tries: number;
}

export const OBS_START: ObsState = { link: 'off', streaming: false, recording: false, safe: false, owns: false, tries: 0 };

export type ObsEvent =
  | { t: 'enable' }
  | { t: 'disable' }
  /** The wait is over, or the person pressed "Look for OBS now". */
  | { t: 'retry' }
  | { t: 'connected'; streaming: boolean; recording: boolean }
  | { t: 'failed'; why: ObsFailure }
  /** OBS went away: closed, or the connection dropped. */
  | { t: 'closed' }
  | { t: 'output'; kind: 'stream' | 'record'; active: boolean }
  /** Stream-safe was switched, by anyone. */
  | { t: 'safe'; on: boolean };

export type ObsAction =
  | { do: 'connect' }
  | { do: 'disconnect' }
  | { do: 'retryIn'; ms: number }
  | { do: 'cancelRetry' }
  | { do: 'safeOn' }
  | { do: 'offerOff' };

/** How long to wait before looking for OBS again: quick at first (it may be starting), then easy, never more than 30 seconds. */
export function retryDelay(tries: number): number {
  return [3000, 5000, 8000, 13000, 20000][Math.max(tries, 1) - 1] ?? 30000;
}

/** True while anything is going out from OBS: on air, or recording. */
export const isLive = (s: Pick<ObsState, 'streaming' | 'recording'>): boolean => s.streaming || s.recording;

type Step = { state: ObsState; actions: ObsAction[] };

/** What changes when the live flag flips: turn Stream-safe on when going live, offer to turn it off when it ends. */
function liveChange(before: ObsState, after: ObsState): Step {
  const was = isLive(before);
  const now = isLive(after);
  if (!was && now) {
    if (after.safe) return { state: { ...after, owns: false }, actions: [] };
    return { state: { ...after, safe: true, owns: true }, actions: [{ do: 'safeOn' }] };
  }
  if (was && !now) {
    const offer = after.owns && after.safe;
    return { state: { ...after, owns: false }, actions: offer ? [{ do: 'offerOff' }] : [] };
  }
  return { state: after, actions: [] };
}

/**
 * The whole going-live rulebook as one function: the state and an event go in, the new state and what to do come out.
 * It never throws and never does anything itself, so OBS missing, wrong, or vanishing mid-stream is just more events.
 */
export function obsStep(state: ObsState, ev: ObsEvent): Step {
  switch (ev.t) {
    case 'enable':
      if (state.link !== 'off') return { state, actions: [] };
      return { state: { ...state, link: 'connecting', tries: 0 }, actions: [{ do: 'connect' }] };
    case 'disable':
      if (state.link === 'off') return { state, actions: [] };
      return { state: { ...state, link: 'off', streaming: false, recording: false, owns: false, tries: 0 }, actions: [{ do: 'cancelRetry' }, { do: 'disconnect' }] };
    case 'retry':
      if (state.link !== 'waiting' && state.link !== 'password' && state.link !== 'address') return { state, actions: [] };
      return { state: { ...state, link: 'connecting' }, actions: [{ do: 'cancelRetry' }, { do: 'connect' }] };
    case 'connected': {
      if (state.link !== 'connecting') return { state, actions: [] };
      const next = { ...state, link: 'connected' as const, tries: 0, streaming: ev.streaming, recording: ev.recording };
      return liveChange({ ...state, streaming: false, recording: false }, next);
    }
    case 'failed': {
      if (state.link !== 'connecting') return { state, actions: [] };
      if (ev.why === 'password' || ev.why === 'address') return { state: { ...state, link: ev.why }, actions: [] };
      const tries = state.tries + 1;
      return { state: { ...state, link: 'waiting', tries }, actions: [{ do: 'retryIn', ms: ev.why === 'refused' ? 30000 : retryDelay(tries) }] };
    }
    case 'closed': {
      if (state.link !== 'connected') return { state, actions: [] };
      const gone = liveChange(state, { ...state, link: 'waiting', streaming: false, recording: false, tries: 1 });
      return { state: gone.state, actions: [...gone.actions, { do: 'retryIn', ms: retryDelay(1) }] };
    }
    case 'output': {
      if (state.link !== 'connected') return { state, actions: [] };
      const after = ev.kind === 'stream' ? { ...state, streaming: ev.active } : { ...state, recording: ev.active };
      return liveChange(state, after);
    }
    case 'safe': {
      if (state.safe === ev.on) return { state, actions: [] };
      // Switched off by hand: whatever was offered is moot. Switched on by hand mid-broadcast is theirs, not ours.
      return { state: { ...state, safe: ev.on, owns: ev.on ? state.owns : false }, actions: [] };
    }
  }
}

export type ObsLook = { tone: 'live' | 'ready' | 'waiting' | 'attention'; label: string; detail: string };

/** What the little indicator in the top bar says, or null when the link is switched off (nothing to show). */
export function obsLook(s: ObsState): ObsLook | null {
  switch (s.link) {
    case 'off':
      return null;
    case 'connecting':
      return { tone: 'waiting', label: 'OBS: looking', detail: 'Looking for OBS.' };
    case 'waiting':
      return { tone: 'waiting', label: 'OBS: not found', detail: 'OBS is not running, or its WebSocket server is off. Frameling keeps looking quietly.' };
    case 'password':
      return { tone: 'attention', label: 'OBS: password', detail: 'OBS wants a password Frameling does not have, or has the wrong one. Press to fix it.' };
    case 'address':
      return { tone: 'attention', label: 'OBS: address', detail: 'Frameling cannot use the address typed for OBS. Press to fix it.' };
    case 'connected':
      if (isLive(s)) return { tone: 'live', label: s.streaming ? 'OBS: live' : 'OBS: recording', detail: s.streaming ? 'You are live in OBS.' : 'OBS is recording.' };
      return { tone: 'ready', label: 'OBS: connected', detail: 'Connected to OBS. Stream-safe turns on by itself when you start streaming or recording.' };
  }
}
