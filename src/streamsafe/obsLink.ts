// Going live with OBS, the page's side: one controller that runs the rulebook in obsLogic.ts against the desktop
// bridge. Everything it touches is passed in, so tests run it against a fake OBS with fake timers. OBS not running is
// the ordinary case here: a failed try is a quiet state with a quiet retry, never a message.
import type { ObsBridge } from '../preload/api';
import { OBS_START, isLive, obsStep, parseObsAddress, type ObsAction, type ObsEvent, type ObsState } from './obsLogic';

export interface ObsDeps {
  /** The desktop side, or null where there is none (a browser tab), where this does nothing. */
  bridge: ObsBridge | null;
  address(): string;
  isSafe(): boolean;
  setSafe(on: boolean): void;
  /** Hears Stream-safe being switched by anyone. */
  onSafe(fn: () => void): () => void;
  /** Puts the question "turn it off again?" (the remembered answer, or a sheet). Calls `run(true)` to turn it off. */
  offerOff(run: (turnOff: boolean) => void): void;
  /** A short friendly line for the person (a toast). */
  say(text: string): void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export const SAID = {
  connected: 'Connected to OBS. Stream-safe turns on by itself when you start streaming or recording.',
  noDesktop: 'Going live with OBS works in the Frameling desktop app.',
  streamOn: 'OBS started streaming, so Stream-safe is on. File paths, names and keys show as stand-ins.',
  recordOn: 'OBS started recording, so Stream-safe is on. File paths, names and keys show as stand-ins.',
  off: 'OBS stopped, so Stream-safe is off again.',
} as const;

export class ObsLink {
  private s: ObsState = OBS_START;
  private listeners = new Set<() => void>();
  private timer: unknown = null;
  private attempt = 0;
  private quiet = true;
  private cleanups: (() => void)[] = [];
  private pw: { canSave: boolean; hasPassword: boolean } = { canSave: false, hasPassword: false };

  private offBridge: (() => void) | null = null;

  constructor(private d: ObsDeps) {}

  /** Starts listening to OBS's messages and to Stream-safe. Call once. */
  attach(): void {
    this.s = { ...this.s, safe: this.d.isSafe() };
    this.cleanups.push(this.d.onSafe(() => this.dispatch({ t: 'safe', on: this.d.isSafe() })));
    this.listen();
    this.cleanups.push(() => this.offBridge?.());
  }

  private listen(): void {
    this.offBridge?.();
    this.offBridge = this.d.bridge?.onEvent((m) => this.dispatch(m.type === 'closed' ? { t: 'closed' } : { t: 'output', kind: m.kind, active: m.active })) ?? null;
  }

  /** Swaps the desktop side (a picture or a test drives a pretend OBS this way). */
  useBridge(bridge: ObsBridge | null): void {
    this.d = { ...this.d, bridge };
    this.listen();
    this.emit();
  }

  detach(): void {
    for (const c of this.cleanups.splice(0)) c();
    this.clear();
  }

  get state(): ObsState {
    return this.s;
  }

  /** Whether there is a desktop side to talk to at all. */
  get available(): boolean {
    return !!this.d.bridge;
  }

  /** What the desktop side said about the password, as of the last time it was asked. */
  get password(): { canSave: boolean; hasPassword: boolean } {
    return this.pw;
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  };

  /** Starts watching OBS. `quiet` is for the start of a session (it was already on): no "Connected" line. */
  enable(opts: { quiet?: boolean } = {}): void {
    if (!this.d.bridge) {
      this.d.say(SAID.noDesktop);
      return;
    }
    this.quiet = !!opts.quiet;
    void this.refreshPassword();
    this.dispatch({ t: 'enable' });
  }

  disable(): void {
    this.dispatch({ t: 'disable' });
  }

  /** Looks for OBS right now (the button, the command), instead of waiting for the next quiet try. */
  lookNow(): void {
    this.quiet = false;
    this.dispatch({ t: 'retry' });
  }

  /** The address changed while watching: look again at the new one. */
  addressChanged(): void {
    if (this.s.link === 'off') return;
    this.dispatch({ t: 'disable' });
    this.dispatch({ t: 'enable' });
  }

  async refreshPassword(): Promise<void> {
    try {
      const st = await this.d.bridge?.status();
      if (st) {
        this.pw = st;
        this.emit();
      }
    } catch {
      // No answer: leave what was known.
    }
  }

  /** Hands the password to the desktop side (it never comes back up). null forgets it. Then looks again. */
  async setPassword(password: string | null, remember: boolean): Promise<void> {
    try {
      const r = await this.d.bridge?.setPassword(password, remember);
      if (r) this.pw = { canSave: this.pw.canSave, hasPassword: r.hasPassword };
    } catch {
      // Quiet: the next try says what is wrong.
    }
    await this.refreshPassword();
    this.quiet = false;
    this.dispatch({ t: 'retry' });
  }

  /** Runs one event through the rulebook and does what it says. */
  dispatch(ev: ObsEvent): void {
    const before = this.s;
    const { state, actions } = obsStep(this.s, ev);
    this.s = state;
    if (state !== before) this.emit();
    for (const a of actions) this.run(a);
  }

  private emit(): void {
    for (const f of [...this.listeners]) f();
  }

  private clear(): void {
    if (this.timer !== null) this.d.clearTimer(this.timer);
    this.timer = null;
  }

  private run(a: ObsAction): void {
    switch (a.do) {
      case 'connect':
        return this.connect();
      case 'disconnect':
        this.attempt++;
        void this.d.bridge?.disconnect().catch(() => undefined);
        return;
      case 'cancelRetry':
        return this.clear();
      case 'retryIn':
        this.clear();
        this.timer = this.d.setTimer(() => {
          this.timer = null;
          this.quiet = true;
          this.dispatch({ t: 'retry' });
        }, a.ms);
        return;
      case 'safeOn':
        this.d.setSafe(true);
        this.d.say(this.s.recording && !this.s.streaming ? SAID.recordOn : SAID.streamOn);
        return;
      case 'offerOff':
        this.d.offerOff((turnOff) => {
          // Going live again while the question was open, or Stream-safe already switched off: nothing to do.
          if (!turnOff || isLive(this.s) || !this.d.isSafe()) return;
          this.d.setSafe(false);
          this.d.say(SAID.off);
        });
        return;
    }
  }

  private connect(): void {
    const mine = ++this.attempt;
    const parsed = parseObsAddress(this.d.address());
    if (!parsed.ok) {
      queueMicrotask(() => this.dispatch({ t: 'failed', why: 'address' }));
      return;
    }
    const bridge = this.d.bridge;
    if (!bridge) return;
    void bridge.connect(this.d.address()).then(
      (r) => {
        if (mine !== this.attempt || this.s.link !== 'connecting') return;
        if (r.ok) {
          const loud = !this.quiet;
          this.dispatch({ t: 'connected', streaming: r.streaming, recording: r.recording });
          if (loud && this.state.link === 'connected' && !isLive(this.state)) this.d.say(SAID.connected);
        } else this.dispatch({ t: 'failed', why: r.why });
      },
      () => {
        if (mine === this.attempt) this.dispatch({ t: 'failed', why: 'unreachable' });
      },
    );
  }
}
