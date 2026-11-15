// A pretend Twitch for the tests: the sign-in endpoints, the Helix calls and an EventSub socket you can talk to. It
// records what it was asked, so a test can check what Frameling sent (and did not send).
import type { HttpFetch, HttpResponse } from '../../src/main/twitchAuth';
import type { SocketLike } from '../../src/main/twitchEventSub';
import type { SafeStorageLike, SecretFile } from '../../src/main/obsSecret';

export interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  form: Record<string, string>;
  json: any;
}

const res = (status: number, body: unknown): HttpResponse => ({ status, json: async () => body });

export class FakeTwitch {
  calls: Call[] = [];
  /** How many times the token endpoint says "not yet" before it says yes. */
  pendingAnswers = 2;
  deviceAnswer: 'ok' | 'denied' | 'expired' | 'slow' = 'ok';
  userId = '4242';
  login = 'quilltest';
  /** The scopes Twitch grants (and validate reports). */
  scopes = ['channel:read:redemptions'];
  tokenLife = 3600;
  nextToken = 1;
  refreshAnswer: 'ok' | 'gone' | 'offline' = 'ok';
  validAccess = new Set<string>();
  revoked: string[] = [];
  offline = false;
  subStatus: Record<string, number> = {};
  rewards: { id: string; title: string; cost: number }[] | 403 = [{ id: 'rw1', title: 'Hydrate', cost: 100 }];
  helixStatus: number | null = null;
  slowSent = false;

  fetch: HttpFetch = async (url, init) => {
    const body = init?.body ?? '';
    const form: Record<string, string> = {};
    let json: any = null;
    if (init?.headers?.['Content-Type']?.includes('x-www-form-urlencoded')) new URLSearchParams(body).forEach((v, k) => (form[k] = v));
    else if (body) json = JSON.parse(body);
    this.calls.push({ url, method: init?.method ?? 'GET', headers: init?.headers ?? {}, body, form, json });
    if (this.offline) throw new Error('offline');
    const u = new URL(url);
    if (u.pathname === '/oauth2/device') return res(200, { device_code: 'DEV-SECRET-CODE', user_code: 'ABCDEFGH', verification_uri: 'https://www.twitch.tv/activate?public=true&device-code=ABCDEFGH', expires_in: 1800, interval: 5 });
    if (u.pathname === '/oauth2/token' && form.grant_type?.includes('device_code')) {
      if (this.deviceAnswer === 'denied') return res(400, { status: 400, message: 'access_denied' });
      if (this.deviceAnswer === 'expired') return res(400, { status: 400, message: 'invalid device code' });
      if (this.deviceAnswer === 'slow' && !this.slowSent) {
        this.slowSent = true;
        return res(400, { status: 400, message: 'slow_down' });
      }
      if (this.pendingAnswers-- > 0) return res(400, { status: 400, message: 'authorization_pending' });
      return res(200, this.issue());
    }
    if (u.pathname === '/oauth2/token' && form.grant_type === 'refresh_token') {
      if (this.refreshAnswer === 'gone') return res(400, { status: 400, message: 'Invalid refresh token' });
      if (this.refreshAnswer === 'offline') return res(503, {});
      return res(200, this.issue());
    }
    if (u.pathname === '/oauth2/validate') {
      const t = (init?.headers?.Authorization ?? '').replace('OAuth ', '');
      if (!this.validAccess.has(t)) return res(401, { status: 401, message: 'invalid access token' });
      return res(200, { client_id: 'cid', login: this.login, user_id: this.userId, scopes: this.scopes, expires_in: 3000 });
    }
    if (u.pathname === '/oauth2/revoke') {
      this.revoked.push(form.token);
      this.validAccess.delete(form.token);
      return res(200, {});
    }
    if (u.pathname === '/helix/eventsub/subscriptions') {
      if (this.helixStatus) return res(this.helixStatus, {});
      const bearer = (init?.headers?.Authorization ?? '').replace('Bearer ', '');
      if (!this.validAccess.has(bearer)) return res(401, {});
      return res(this.subStatus[json.type] ?? 202, {});
    }
    if (u.pathname === '/helix/channel_points/custom_rewards') {
      const bearer = (init?.headers?.Authorization ?? '').replace('Bearer ', '');
      if (!this.validAccess.has(bearer)) return res(401, {});
      return this.rewards === 403 ? res(403, {}) : res(200, { data: this.rewards });
    }
    return res(404, {});
  };

  private issue() {
    const n = this.nextToken++;
    const access = `access-${n}`;
    this.validAccess.add(access);
    return { access_token: access, refresh_token: `refresh-${n}`, expires_in: this.tokenLife, scope: this.scopes, token_type: 'bearer' };
  }

  callsTo(path: string): Call[] {
    return this.calls.filter((c) => new URL(c.url).pathname === path);
  }
}

/** A socket the test drives by hand. */
export class FakeSocket implements SocketLike {
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code?: number }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  closed = false;
  constructor(public url: string) {}
  close() {
    this.closed = true;
  }
  /** Twitch says something. */
  say(type: string, payload: unknown = {}, extra: Record<string, unknown> = {}) {
    this.onmessage?.({ data: JSON.stringify({ metadata: { message_id: `m-${Math.random()}`, message_type: type, message_timestamp: new Date().toISOString(), ...extra }, payload }) });
  }
  welcome(id = 'sess-1', keepalive = 10) {
    this.say('session_welcome', { session: { id, status: 'connected', keepalive_timeout_seconds: keepalive, reconnect_url: null } });
  }
  notify(type: string, event: unknown, extra: Record<string, unknown> = {}) {
    this.say('notification', { subscription: { type }, event }, { subscription_type: type, ...extra });
  }
  drop(code = 1006) {
    this.onclose?.({ code });
  }
}

/** A clock the test moves by hand. */
export class FakeClock {
  t = 1_000_000;
  timers: { at: number; fn: () => void; id: number }[] = [];
  private n = 0;
  now = () => this.t;
  later = (fn: () => void, ms: number) => {
    const id = this.n++;
    this.timers.push({ at: this.t + ms, fn, id });
    return () => void (this.timers = this.timers.filter((x) => x.id !== id));
  };
  sleep = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve) => {
      if (signal?.aborted) return resolve();
      const cancel = this.later(resolve, ms);
      signal?.addEventListener('abort', () => (cancel(), resolve()), { once: true });
    });
  /** Moves time on, firing what falls due in order, letting promises settle between each. */
  async advance(ms: number) {
    const to = this.t + ms;
    for (;;) {
      await settle();
      const next = this.timers.filter((x) => x.at <= to).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.timers = this.timers.filter((x) => x.id !== next.id);
      this.t = Math.max(this.t, next.at);
      next.fn();
    }
    this.t = to;
    await settle();
  }
}

export const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

/** A key store that "encrypts" by reversing and tagging, so a test can see the plain text is not on disk. */
export function fakeSafe(real = true): SafeStorageLike {
  return {
    isEncryptionAvailable: () => real,
    encryptString: (s) => Buffer.from('ENC:' + s.split('').reverse().join('')),
    decryptString: (b) => b.toString().slice(4).split('').reverse().join(''),
    getSelectedStorageBackend: () => (real ? 'gnome_libsecret' : 'basic_text'),
  };
}

export function memoryFile(): SecretFile & { text: string | null } {
  const f = {
    text: null as string | null,
    read: () => f.text,
    write: (t: string) => void (f.text = t),
    remove: () => void (f.text = null),
  };
  return f;
}
