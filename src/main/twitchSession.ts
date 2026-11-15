// The Twitch link as a whole, on the desktop side: signing in with a device code, keeping the sign-in fresh, listening
// over EventSub, reading the streamer's own reward names, and signing out for real. The page only ever hears a TwitchStatus
// and the small events from shared/twitch.ts. A token, a device code and a viewer's name never go up to the page.
// Everything outside (network, sockets, clock, the key store, the browser, the clipboard) is handed in, so a pretend
// Twitch tests it, and nothing here imports Electron.
import { cleanKinds, coveredKinds, isTwitchApprovalAddress, KIND_INFO, scopesFor, type TwitchEvent, type TwitchKind, type TwitchProblem, type TwitchRewardsAnswer, type TwitchStatus } from '../shared/twitch';
import { collectTokens, refreshTokens, requestDeviceCode, revokeToken, validateToken, type Clock, type DeviceGrant, type HttpFetch, type SignInFailure, type Tokens } from './twitchAuth';
import { EventSubClient, type Listening, type SocketLike, type SubscribeOutcome } from './twitchEventSub';
import type { TwitchTokens } from './twitchTokens';

export const HELIX = 'https://api.twitch.tv/helix';
/** Twitch asks apps to check their token about once an hour. */
export const VALIDATE_EVERY_MS = 60 * 60_000;
/** Refresh a little before the token runs out. */
const REFRESH_EARLY_MS = 60_000;

export type SessionMessage = { type: 'status'; status: TwitchStatus } | { type: 'event'; event: TwitchEvent };

export interface SessionDeps {
  fetch: HttpFetch;
  socket(url: string): SocketLike;
  clock: Clock & { later(fn: () => void, ms: number): () => void };
  tokens: TwitchTokens;
  /** The Twitch app (client id) that signs in, or '' for none. */
  clientId(): string;
  app(): 'built-in' | 'own' | 'none';
  /** The streamer pasted in their own client id (or null to go back to the built-in one). */
  setOwnApp(id: string | null): void;
  emit(m: SessionMessage): void;
  openExternal(url: string): void;
  writeClipboard(text: string): void;
  eventSubUrl?: string;
}

const CLIENT_ID_RE = /^[a-z0-9]{20,40}$/;
/** A Twitch client id is 30 letters and digits. Anything else is not one. */
export const looksLikeClientId = (s: string): boolean => CLIENT_ID_RE.test(s);

const failureToProblem: Record<SignInFailure, TwitchProblem> = { denied: 'denied', expired: 'expired', failed: 'failed', offline: 'offline', cancelled: '' };

export class TwitchSession {
  private pending: { grant: DeviceGrant; expiresAt: number; abort: AbortController } | null = null;
  private problem: TwitchProblem = '';
  private listening: Listening = 'off';
  private clientRefused: TwitchKind[] = [];
  private scopeRefused: TwitchKind[] = [];
  private wanted: TwitchKind[] = [];
  private refreshing: Promise<string | null> | null = null;
  private cancelValidate: (() => void) | null = null;
  private client: EventSubClient;
  private begun = 0;

  constructor(private d: SessionDeps) {
    this.client = new EventSubClient({
      socket: (u) => d.socket(u),
      later: (fn, ms) => d.clock.later(fn, ms),
      now: () => d.clock.now(),
      url: d.eventSubUrl,
      subscribe: (id, kinds) => this.subscribeAll(id, kinds),
      onEvent: (event) => d.emit({ type: 'event', event }),
      onState: (s) => {
        this.listening = s.listening;
        this.clientRefused = s.refused;
        this.push();
      },
      onAuthLost: () => this.authLost(),
    });
  }

  status(): TwitchStatus {
    const t = this.d.tokens.get();
    const app = this.d.app();
    return {
      app,
      canSave: this.d.tokens.canSave,
      state: this.pending ? 'signing-in' : t ? 'signed-in' : 'signed-out',
      login: t?.login ?? '',
      scopes: t ? [...t.scopes] : [],
      listening: this.listening,
      refused: [...new Set([...this.scopeRefused, ...this.clientRefused])],
      problem: this.problem || (app === 'none' ? 'no-app' : ''),
    };
  }

  private push(): void {
    this.d.emit({ type: 'status', status: this.status() });
  }

  // ---------------------------------------------------------------- the client id

  /** Uses the streamer's own Twitch app. Signs out first, because a token belongs to the app that made it. */
  async setApp(id: string | null): Promise<TwitchStatus> {
    const clean = id === null ? null : id.trim();
    if (clean !== null && clean !== '' && !looksLikeClientId(clean)) {
      this.problem = 'failed';
      return this.status();
    }
    await this.signOut();
    this.d.setOwnApp(clean || null);
    this.problem = '';
    this.push();
    return this.status();
  }

  // ---------------------------------------------------------------- signing in

  /** Starts a sign-in for these kinds. Resolves once there is a code to show (or it could not start); the approval finishes in the background. */
  async signIn(kinds: TwitchKind[]): Promise<TwitchStatus> {
    const clientId = this.d.clientId();
    if (!clientId) {
      this.problem = 'no-app';
      this.push();
      return this.status();
    }
    this.cancelSignIn(false);
    this.problem = '';
    const scopes = scopesFor(cleanKinds(kinds));
    const abort = new AbortController();
    const grant = await requestDeviceCode(this.d.fetch, clientId, scopes, abort.signal);
    if (!grant) {
      this.problem = 'failed';
      this.push();
      return this.status();
    }
    this.pending = { grant, expiresAt: this.d.clock.now() + grant.expiresIn * 1000, abort };
    this.push();
    void collectTokens(this.d.fetch, clientId, scopes, grant, this.d.clock, abort.signal).then((r) => {
      if (this.pending?.abort !== abort) return;
      this.pending = null;
      if (typeof r === 'string') {
        this.problem = failureToProblem[r];
        return this.push();
      }
      const old = this.d.tokens.get();
      this.d.tokens.set(r);
      if (old && old.accessToken !== r.accessToken) void revokeToken(this.d.fetch, clientId, old.accessToken);
      this.problem = '';
      this.push();
    });
    return this.status();
  }

  /** The code to show, only while a sign-in waits. The page asks for it when it is about to draw it, and never when stream-safe mode is on. */
  code(): { userCode: string; expiresAt: number } | null {
    return this.pending ? { userCode: this.pending.grant.userCode, expiresAt: this.pending.expiresAt } : null;
  }

  openApproval(): boolean {
    const u = this.pending?.grant.verificationUri;
    if (!u || !isTwitchApprovalAddress(u)) return false;
    this.d.openExternal(u);
    return true;
  }

  copyApproval(): boolean {
    const u = this.pending?.grant.verificationUri;
    if (!u || !isTwitchApprovalAddress(u)) return false;
    this.d.writeClipboard(u);
    return true;
  }

  cancelSignIn(push = true): void {
    this.pending?.abort.abort();
    this.pending = null;
    if (push) this.push();
  }

  // ---------------------------------------------------------------- signing out

  /** One button, and it means it: stops listening, tells Twitch to cancel the token, forgets it here. `revoked` is false when Twitch could not be reached (it is still forgotten here). */
  async signOut(): Promise<{ revoked: boolean }> {
    this.cancelSignIn(false);
    this.stopListening();
    const t = this.d.tokens.get();
    this.d.tokens.forget();
    this.problem = '';
    this.scopeRefused = [];
    this.push();
    if (!t) return { revoked: true };
    const id = this.d.clientId();
    return { revoked: id ? await revokeToken(this.d.fetch, id, t.accessToken) : false };
  }

  private authLost(): void {
    this.client.stop();
    this.cancelValidate?.();
    this.cancelValidate = null;
    this.d.tokens.forget();
    this.problem = 'needs-sign-in';
    this.push();
  }

  // ---------------------------------------------------------------- tokens

  /** A token that works now, refreshed when it is about to run out. Null when the sign-in is over. */
  private async fresh(force = false): Promise<string | null> {
    const t = this.d.tokens.get();
    if (!t) return null;
    if (!force && t.expiresAt - this.d.clock.now() > REFRESH_EARLY_MS) return t.accessToken;
    // One refresh at a time: a refresh token works once.
    this.refreshing ??= (async () => {
      const r = await refreshTokens(this.d.fetch, this.d.clientId(), t, this.d.clock.now());
      if (r === 'gone') {
        // Twitch ended the sign-in: forget it, stop listening, and say to sign in again.
        this.authLost();
        return null;
      }
      if (r === 'offline') return t.accessToken;
      this.d.tokens.set(r);
      return r.accessToken;
    })().finally(() => void (this.refreshing = null));
    return this.refreshing;
  }

  /** A Twitch call with the token, retried once on a refreshed token when Twitch says the old one is no good. */
  private async helix(path: string, init: { method?: string; body?: string } = {}): Promise<{ status: number; body: unknown } | 'signed-out' | 'offline'> {
    for (let tries = 0; tries < 2; tries++) {
      const token = await this.fresh(tries > 0);
      if (!token) return 'signed-out';
      try {
        const r = await this.d.fetch(`${HELIX}${path}`, {
          method: init.method ?? 'GET',
          headers: { 'Client-Id': this.d.clientId(), Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
          body: init.body,
        });
        if (r.status === 401 && tries === 0) continue;
        let body: unknown = null;
        try {
          body = await r.json();
        } catch {
          // Some answers have no body.
        }
        return { status: r.status, body };
      } catch {
        return 'offline';
      }
    }
    return 'signed-out';
  }

  // ---------------------------------------------------------------- listening

  /** Starts listening for these kinds (only those the granted permissions cover; the rest are reported as refused). */
  async listen(kinds: TwitchKind[]): Promise<TwitchStatus> {
    const wanted = cleanKinds(kinds);
    const mine = ++this.begun;
    this.wanted = wanted;
    const t0 = this.d.tokens.get();
    if (!t0 || !wanted.length || this.pending) return this.status();
    // Check the sign-in still stands, and learn what it may do, before opening anything.
    const token = await this.fresh();
    if (!token || mine !== this.begun) return this.status();
    const who = await validateToken(this.d.fetch, token);
    if (mine !== this.begun) return this.status();
    if (who === null) {
      this.authLost();
      return this.status();
    }
    const t = this.d.tokens.get()!;
    if (who !== 'offline') this.d.tokens.set({ ...t, scopes: who.scopes, userId: who.userId, login: who.login });
    const granted = this.d.tokens.get()!.scopes;
    const covered = coveredKinds(wanted, granted);
    this.scopeRefused = wanted.filter((k) => !covered.includes(k));
    this.problem = '';
    if (!covered.length) {
      this.push();
      return this.status();
    }
    this.client.start(covered);
    this.cancelValidate?.();
    const again = () => {
      this.cancelValidate = this.d.clock.later(async () => {
        const tk = await this.fresh();
        const w = tk ? await validateToken(this.d.fetch, tk) : null;
        if (w === null) return this.authLost();
        again();
      }, VALIDATE_EVERY_MS);
    };
    again();
    return this.status();
  }

  stopListening(): void {
    this.begun++;
    this.cancelValidate?.();
    this.cancelValidate = null;
    this.client.stop();
    this.scopeRefused = [];
    this.listening = 'off';
    this.push();
  }

  /** Makes every Twitch subscription the kinds need, for a new session. */
  private async subscribeAll(sessionId: string, kinds: TwitchKind[]): Promise<SubscribeOutcome> {
    const t = this.d.tokens.get();
    if (!t) return { refused: [], authLost: true };
    const refused: TwitchKind[] = [];
    for (const k of kinds) {
      let kindRefused = false;
      for (const s of KIND_INFO[k].subs) {
        const r = await this.helix('/eventsub/subscriptions', {
          method: 'POST',
          body: JSON.stringify({ type: s.type, version: s.version, condition: s.condition(t.userId), transport: { method: 'websocket', session_id: sessionId } }),
        });
        if (r === 'signed-out') return { refused, authLost: true };
        if (r === 'offline') return { refused, offline: true };
        // 202 made it; 409 is already there (Twitch keeps one of each).
        if (r.status === 202 || r.status === 200 || r.status === 409) continue;
        if (r.status === 401) return { refused, authLost: true };
        if (r.status === 429 || r.status >= 500) return { refused, offline: true };
        kindRefused = true;
      }
      if (kindRefused) refused.push(k);
    }
    return { refused };
  }

  // ---------------------------------------------------------------- the streamer's own rewards

  async rewards(): Promise<TwitchRewardsAnswer> {
    const t = this.d.tokens.get();
    if (!t) return { ok: false, why: 'signed-out' };
    const r = await this.helix(`/channel_points/custom_rewards?broadcaster_id=${encodeURIComponent(t.userId)}`);
    if (r === 'signed-out') return { ok: false, why: 'signed-out' };
    if (r === 'offline') return { ok: false, why: 'failed' };
    if (r.status === 403) return { ok: false, why: 'not-affiliate' };
    if (r.status !== 200) return { ok: false, why: 'failed' };
    const data = (r.body as { data?: unknown } | null)?.data;
    if (!Array.isArray(data)) return { ok: false, why: 'failed' };
    const rewards = data
      .map((x: { id?: unknown; title?: unknown; cost?: unknown }) => ({ id: typeof x.id === 'string' ? x.id : '', title: typeof x.title === 'string' ? x.title.slice(0, 100) : '', cost: typeof x.cost === 'number' ? x.cost : 0 }))
      .filter((x) => x.id && x.title);
    return { ok: true, rewards };
  }
}
