// The page's end of Twitch: the door the gate opens and closes (listening starts and stops with the audience switch),
// and what happens to an event that arrives. An event is not special: it becomes one `submit` per matching link, and the
// gate's switches, cooldowns, queue and Stop apply to it like to anything else. The pieces are handed in, so a pretend
// Twitch side tests it.
import type { TwitchBridge } from '../preload/api';
import type { TwitchEvent, TwitchKind, TwitchStatus } from '../shared/twitch';
import type { Verdict } from '../audience/gate';
import { matchRules, payloadFor, sampleEvent, type TwitchRule } from './rules';

export interface LinkDeps {
  bridge(): TwitchBridge | null;
  gate: { submit(id: string, raw?: unknown): Verdict; snapshot(): { actions: { id: string; label: string }[] } };
  kinds(): TwitchKind[];
  /** Whether to ask the desktop side to read viewers' display names: only while a welcome link is on and names are allowed. */
  names(): boolean;
  rules(): TwitchRule[];
  setStatus(s: TwitchStatus): void;
  /** Something was turned away by the gate: told to the streamer only when they chose to hear it. */
  turnedAway(label: string, reason: string): void;
}

export interface TwitchLink {
  /** The gate opened the door: start listening. */
  open(): void;
  /** The gate closed it (switch off, Stop, the feature going): stop listening. The sign-in stays. */
  close(): void;
  /** The ticked kinds changed: listen again for the new set, if listening. */
  refresh(): void;
  /** Hears the desktop side and keeps the status current. Returns the way to stop. */
  listen(): () => void;
  /** One event, as if Twitch had sent it. What `listen` calls for each. Returns the verdicts, one per link it set off. */
  hear(e: TwitchEvent): Verdict[];
  /** The Try it button: runs one link through the gate with a pretend event. */
  test(rule: TwitchRule): Verdict;
}

export function createTwitchLink(d: LinkDeps): TwitchLink {
  let wanted = false;
  let chain: Promise<unknown> = Promise.resolve();
  const enqueue = (fn: () => Promise<void>) => {
    chain = chain.then(fn).catch(() => undefined);
  };
  const label = (id: string) => d.gate.snapshot().actions.find((a) => a.id === id)?.label ?? id;

  const submit = (rule: TwitchRule, e: TwitchEvent): Verdict => {
    const v = d.gate.submit(rule.action, payloadFor(rule, e));
    if (!v.ok) d.turnedAway(label(rule.action), v.reason);
    return v;
  };

  const link: TwitchLink = {
    open() {
      wanted = true;
      enqueue(async () => {
        const b = d.bridge();
        if (!b || !wanted) return;
        d.setStatus(await b.listen(d.kinds(), d.names()));
      });
    },
    close() {
      wanted = false;
      enqueue(async () => {
        const b = d.bridge();
        if (!b) return;
        await b.stop();
        d.setStatus(await b.status());
      });
    },
    refresh() {
      if (!wanted) return;
      enqueue(async () => {
        const b = d.bridge();
        if (!b || !wanted) return;
        await b.stop();
        d.setStatus(await b.listen(d.kinds(), d.names()));
      });
    },
    listen() {
      const b = d.bridge();
      if (!b) return () => undefined;
      void b.status().then(d.setStatus, () => undefined);
      const offStatus = b.onStatus(d.setStatus);
      const offEvent = b.onEvent((e) => void link.hear(e));
      return () => {
        offStatus();
        offEvent();
      };
    },
    hear(e) {
      return matchRules(d.rules(), e).map((r) => submit(r, e));
    },
    test: (rule) => d.gate.submit(rule.action, payloadFor(rule, sampleEvent(rule))),
  };
  return link;
}
