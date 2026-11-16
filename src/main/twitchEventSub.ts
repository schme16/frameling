// Listening to Twitch over EventSub on a WebSocket. Frameling opens the connection, so Twitch needs no address of ours
// and there is no server to keep running. This file is only the connection: welcome, keep-alives, notices, Twitch asking
// us to move to another address, the line dropping, and trying again. Making the subscriptions (an HTTPS call with the
// token) is handed in, and so are the socket and the clock, so a pretend Twitch tests all of it.
// Privacy: a notice is read through normaliseNotice, which keeps no name unless the page asked for names (see `start`). Only the ids of the last notices are held
// (to throw away repeats), for as long as Frameling is listening.
import { normaliseNotice, type TwitchEvent, type TwitchKind } from '../shared/twitch';

export const EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws';

/** The part of a WebSocket this needs (the browser-style one Node and Electron have built in). */
export interface SocketLike {
  close(code?: number): void;
  onopen: ((e: unknown) => void) | null;
  onmessage: ((e: { data: unknown }) => void) | null;
  onclose: ((e: { code?: number }) => void) | null;
  onerror: ((e: unknown) => void) | null;
}

export type Listening = 'off' | 'connecting' | 'listening' | 'reconnecting';

export interface SubscribeOutcome {
  /** Kinds Twitch refused (no permission, or no channel points on this channel). */
  refused: TwitchKind[];
  /** The token was turned down: sign in again. */
  authLost?: boolean;
  /** Twitch could not be reached at all: try again soon. */
  offline?: boolean;
}

export interface EventSubDeps {
  socket(url: string): SocketLike;
  later(fn: () => void, ms: number): () => void;
  now(): number;
  /** Makes the Twitch subscriptions for a new session. Not asked again when Twitch moves a live session to a new address. */
  subscribe(sessionId: string, kinds: TwitchKind[]): Promise<SubscribeOutcome>;
  onEvent(e: TwitchEvent): void;
  onState(s: { listening: Listening; refused: TwitchKind[] }): void;
  /** Twitch says the sign-in no longer holds. */
  onAuthLost(): void;
  url?: string;
}

/** How long to wait before try number `attempt` (0 first): 1 second, doubling, never more than 30. Exported for the tests. */
export const backoff = (attempt: number): number => Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
/** Extra time beyond Twitch's keep-alive interval before a quiet line counts as dropped. */
export const QUIET_MARGIN_MS = 5000;
/** A notice older than this is a replay, not news. */
export const STALE_MS = 10 * 60_000;
const SEEN_MAX = 200;

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

export class EventSubClient {
  private kinds: TwitchKind[] = [];
  /** Whether display names are read from notices. Off unless the page asked. */
  private names = false;
  private running = false;
  private attempt = 0;
  private refused: TwitchKind[] = [];
  private current: { sock: SocketLike; gen: number } | null = null;
  private moving: { sock: SocketLike; gen: number } | null = null;
  private gen = 0;
  private cancelWatch: (() => void) | null = null;
  private cancelRetry: (() => void) | null = null;
  private seen = new Set<string>();
  private order: string[] = [];
  private listening: Listening = 'off';

  constructor(private d: EventSubDeps) {}

  get state(): Listening {
    return this.listening;
  }

  /** Starts listening for these kinds. Does nothing for an empty list. Safe to call twice. */
  start(kinds: TwitchKind[], names = false): void {
    this.kinds = [...kinds];
    this.names = names === true;
    if (this.running || !kinds.length) return;
    this.running = true;
    this.attempt = 0;
    this.open('connecting');
  }

  /** Closes everything and forgets what was seen. Safe to call twice. */
  stop(): void {
    this.running = false;
    this.cancelRetry?.();
    this.cancelRetry = null;
    this.cancelWatch?.();
    this.cancelWatch = null;
    this.drop(this.current);
    this.drop(this.moving);
    this.current = this.moving = null;
    this.seen.clear();
    this.order = [];
    this.refused = [];
    this.set('off');
  }

  private set(l: Listening): void {
    this.listening = l;
    this.d.onState({ listening: l, refused: [...this.refused] });
  }

  private drop(c: { sock: SocketLike } | null): void {
    if (!c) return;
    c.sock.onopen = c.sock.onmessage = c.sock.onclose = c.sock.onerror = null;
    try {
      c.sock.close(1000);
    } catch {
      // Already closed.
    }
  }

  private open(state: Listening): void {
    this.set(state);
    const c = this.attach(this.d.url ?? EVENTSUB_URL, false);
    this.current = c;
  }

  /** Opens a socket and wires it. `moved` is true for the new address Twitch asked us to go to. */
  private attach(url: string, moved: boolean): { sock: SocketLike; gen: number } {
    const gen = ++this.gen;
    let sock: SocketLike;
    try {
      sock = this.d.socket(url);
    } catch {
      sock = { close: () => undefined, onopen: null, onmessage: null, onclose: null, onerror: null };
      this.d.later(() => this.lost(gen), 0);
    }
    const c = { sock, gen };
    sock.onmessage = (e) => void this.message(c, e.data, moved);
    sock.onclose = () => this.lost(gen);
    sock.onerror = () => undefined;
    return c;
  }

  private armWatch(seconds: number): void {
    this.cancelWatch?.();
    const gen = this.current?.gen ?? -1;
    this.cancelWatch = this.d.later(() => this.lost(gen), seconds * 1000 + QUIET_MARGIN_MS);
  }

  /** The line dropped (or went quiet). Try again, slowly at first. */
  private lost(gen: number): void {
    if (!this.running) return;
    if (this.moving?.gen === gen) {
      // The new address never worked: fall back to a fresh start on the old connection's failure path.
      this.drop(this.moving);
      this.moving = null;
      return;
    }
    if (this.current?.gen !== gen) return;
    this.drop(this.current);
    this.drop(this.moving);
    this.current = this.moving = null;
    this.cancelWatch?.();
    this.cancelWatch = null;
    this.set('reconnecting');
    const wait = backoff(this.attempt++);
    this.cancelRetry?.();
    this.cancelRetry = this.d.later(() => {
      this.cancelRetry = null;
      if (this.running) this.open('reconnecting');
    }, wait);
  }

  private async message(c: { sock: SocketLike; gen: number }, data: unknown, moved: boolean): Promise<void> {
    if (!this.running) return;
    let m: Record<string, unknown>;
    try {
      m = rec(JSON.parse(typeof data === 'string' ? data : String(data)));
    } catch {
      return;
    }
    const meta = rec(m.metadata);
    const payload = rec(m.payload);
    const type = typeof meta.message_type === 'string' ? meta.message_type : '';
    const isLive = this.current?.gen === c.gen;
    if (isLive) this.armWatchFromSession();

    if (type === 'session_welcome') {
      const session = rec(payload.session);
      const id = typeof session.id === 'string' ? session.id : '';
      const keep = typeof session.keepalive_timeout_seconds === 'number' ? session.keepalive_timeout_seconds : 10;
      this.keepalive = keep;
      if (!id) return;
      if (moved) {
        // Twitch moved the live session: its subscriptions came with it. Swap and close the old line.
        const old = this.current;
        this.current = c;
        this.moving = null;
        this.drop(old);
        this.armWatch(keep);
        return;
      }
      this.armWatch(keep);
      const out = await this.d.subscribe(id, this.kinds);
      if (!this.running || this.current?.gen !== c.gen) return;
      this.refused = out.refused;
      if (out.authLost) {
        this.d.onAuthLost();
        return this.stop();
      }
      if (out.offline) return this.lost(c.gen);
      this.attempt = 0;
      this.set('listening');
      return;
    }
    if (type === 'session_keepalive') return;
    if (type === 'session_reconnect') {
      const url = typeof rec(payload.session).reconnect_url === 'string' ? (rec(payload.session).reconnect_url as string) : '';
      if (!url || this.moving || !/^wss:\/\//.test(url)) return;
      this.moving = this.attach(url, true);
      return;
    }
    if (type === 'revocation') {
      if (rec(payload.subscription).status === 'authorization_revoked') {
        this.d.onAuthLost();
        this.stop();
      }
      return;
    }
    if (type !== 'notification') return;

    const id = typeof meta.message_id === 'string' ? meta.message_id : '';
    if (id) {
      if (this.seen.has(id)) return;
      this.seen.add(id);
      this.order.push(id);
      if (this.order.length > SEEN_MAX) this.seen.delete(this.order.shift()!);
    }
    const stamp = typeof meta.message_timestamp === 'string' ? Date.parse(meta.message_timestamp) : NaN;
    if (Number.isFinite(stamp) && this.d.now() - stamp > STALE_MS) return;
    const e = normaliseNotice(typeof meta.subscription_type === 'string' ? meta.subscription_type : '', payload.event, { names: this.names });
    if (e && this.kinds.includes(e.kind)) this.d.onEvent(e);
  }

  private keepalive = 10;
  private armWatchFromSession(): void {
    this.armWatch(this.keepalive);
  }
}
