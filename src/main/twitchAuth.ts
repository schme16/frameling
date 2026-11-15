// Signing in to Twitch with the device code flow, and keeping the sign-in alive. A public app has no secret: Frameling
// asks Twitch for a short code, the person approves it in a browser, and Frameling collects the token. Nothing here
// touches Electron, the clock or the network directly, so a pretend Twitch tests all of it.
// Tokens never leave the desktop side: the page is only ever told that there is a sign-in, and whose.

export interface HttpResponse {
  status: number;
  json(): Promise<unknown>;
}
export type HttpFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<HttpResponse>;

export const TWITCH_ID = 'https://id.twitch.tv/oauth2';
export const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

/** What Twitch gives back for a device code request. `deviceCode` is the part that collects the token: it stays here. */
export interface DeviceGrant {
  deviceCode: string;
  userCode: string;
  /** The page to approve on, with the code already filled in. */
  verificationUri: string;
  /** Seconds the code lives. */
  expiresIn: number;
  /** Seconds to wait between asking whether it was approved. */
  interval: number;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** When the access token stops working, in milliseconds since 1970. */
  expiresAt: number;
  scopes: string[];
  userId: string;
  login: string;
}

export type SignInFailure = 'denied' | 'expired' | 'failed' | 'offline' | 'cancelled';

const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});
const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const secs = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback);

async function post(fetch: HttpFetch, url: string, body: Record<string, string>, signal?: AbortSignal): Promise<{ status: number; body: Record<string, unknown> }> {
  const r = await fetch(url, { method: 'POST', headers: FORM, body: form(body), signal });
  let b: Record<string, unknown> = {};
  try {
    b = rec(await r.json());
  } catch {
    // An empty answer (revoke says 200 with nothing) is fine.
  }
  return { status: r.status, body: b };
}

/** Asks Twitch for a device code for these permissions. Null when Twitch said no or could not be reached. */
export async function requestDeviceCode(fetch: HttpFetch, clientId: string, scopes: string[], signal?: AbortSignal): Promise<DeviceGrant | null> {
  try {
    const { status, body } = await post(fetch, `${TWITCH_ID}/device`, { client_id: clientId, scopes: scopes.join(' ') }, signal);
    if (status !== 200) return null;
    const deviceCode = text(body.device_code);
    const userCode = text(body.user_code);
    const verificationUri = text(body.verification_uri);
    if (!deviceCode || !userCode || !verificationUri) return null;
    return { deviceCode, userCode, verificationUri, expiresIn: secs(body.expires_in, 1800), interval: secs(body.interval, 5) };
  } catch {
    return null;
  }
}

export interface Clock {
  now(): number;
  /** Resolves after `ms`, or at once when `signal` aborts. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise((resolve) => {
      if (signal?.aborted) return resolve();
      const done = () => {
        clearTimeout(t);
        signal?.removeEventListener('abort', done);
        resolve();
      };
      const t = setTimeout(done, ms);
      signal?.addEventListener('abort', done, { once: true });
    }),
};

/** Who a token belongs to, and what it may do. Null when Twitch does not know the token (revoked, expired, wrong). */
export async function validateToken(fetch: HttpFetch, accessToken: string): Promise<{ userId: string; login: string; scopes: string[]; expiresIn: number } | null | 'offline'> {
  try {
    const r = await fetch(`${TWITCH_ID}/validate`, { headers: { Authorization: `OAuth ${accessToken}` } });
    if (r.status === 401) return null;
    if (r.status !== 200) return 'offline';
    const b = rec(await r.json());
    const userId = text(b.user_id);
    if (!userId) return null;
    return { userId, login: text(b.login), scopes: Array.isArray(b.scopes) ? b.scopes.filter((s): s is string => typeof s === 'string') : [], expiresIn: secs(b.expires_in, 0) };
  } catch {
    return 'offline';
  }
}

async function tokensFrom(fetch: HttpFetch, body: Record<string, unknown>, now: number): Promise<Tokens | null | 'offline'> {
  const accessToken = text(body.access_token);
  const refreshToken = text(body.refresh_token);
  if (!accessToken || !refreshToken) return null;
  const who = await validateToken(fetch, accessToken);
  if (who === 'offline' || who === null) return who;
  return { accessToken, refreshToken, expiresAt: now + secs(body.expires_in, 3600) * 1000, scopes: who.scopes, userId: who.userId, login: who.login };
}

/**
 * Waits for the person to approve the code, asking as often as Twitch allows (and slower when it says slow down).
 * Returns the tokens, or why it stopped. Stops at once when `signal` aborts.
 */
export async function collectTokens(fetch: HttpFetch, clientId: string, scopes: string[], grant: DeviceGrant, clock: Clock, signal: AbortSignal): Promise<Tokens | SignInFailure> {
  let wait = grant.interval * 1000;
  const until = clock.now() + grant.expiresIn * 1000;
  while (!signal.aborted) {
    await clock.sleep(wait, signal);
    if (signal.aborted) break;
    if (clock.now() > until) return 'expired';
    let res: { status: number; body: Record<string, unknown> };
    try {
      res = await post(fetch, `${TWITCH_ID}/token`, { client_id: clientId, scopes: scopes.join(' '), device_code: grant.deviceCode, grant_type: DEVICE_GRANT }, signal);
    } catch {
      if (signal.aborted) break;
      // The network blinked. Keep trying until the code runs out.
      continue;
    }
    if (res.status === 200) {
      const t = await tokensFrom(fetch, res.body, clock.now());
      return t === null ? 'failed' : t === 'offline' ? 'offline' : t;
    }
    const why = text(res.body.message) || text(res.body.error);
    if (/authorization_pending/.test(why)) continue;
    if (/slow_down/.test(why)) {
      wait += 5000;
      continue;
    }
    if (/access_denied/.test(why)) return 'denied';
    if (/expired|invalid device code|invalid_grant/i.test(why)) return 'expired';
    return 'failed';
  }
  return 'cancelled';
}

/** Trades the refresh token for a new pair. 'gone' when Twitch will not (the sign-in is over: sign in again). */
export async function refreshTokens(fetch: HttpFetch, clientId: string, old: Tokens, now: number): Promise<Tokens | 'gone' | 'offline'> {
  let res: { status: number; body: Record<string, unknown> };
  try {
    res = await post(fetch, `${TWITCH_ID}/token`, { client_id: clientId, grant_type: 'refresh_token', refresh_token: old.refreshToken });
  } catch {
    return 'offline';
  }
  if (res.status === 400 || res.status === 401) return 'gone';
  if (res.status !== 200) return 'offline';
  const t = await tokensFrom(fetch, res.body, now);
  return t === null ? 'gone' : t;
}

/** Tells Twitch to cancel the token for good. True when Twitch said so. */
export async function revokeToken(fetch: HttpFetch, clientId: string, token: string): Promise<boolean> {
  try {
    const { status } = await post(fetch, `${TWITCH_ID}/revoke`, { client_id: clientId, token });
    return status === 200;
  } catch {
    return false;
  }
}
