// The page's link to Twitch, with a pretend gate and a pretend desktop side: opens and closes in order, and says when the gate turned something away.
import { describe, expect, it, vi } from 'vitest';
import { createTwitchLink } from '../../src/twitch/link';
import { signedOutStatus, type TwitchStatus } from '../../src/shared/twitch';
import type { TwitchRule } from '../../src/twitch/rules';

const rule: TwitchRule = { id: 'a', event: 'follow', action: 'quill.hop', on: true };
const build = (verdict: { ok: boolean; reason?: string } = { ok: true }) => {
  const log: string[] = [];
  const told: string[] = [];
  const statuses: TwitchStatus[] = [];
  const submit = vi.fn((id: string, raw?: unknown) => (log.push(`submit ${id} ${JSON.stringify(raw)}`), verdict as never));
  let resolveListen: (s: TwitchStatus) => void = () => undefined;
  const bridge = {
    listen: vi.fn(() => new Promise<TwitchStatus>((r) => (resolveListen = r))),
    stop: vi.fn(async () => void log.push('stop')),
    status: vi.fn(async () => signedOutStatus()),
    onEvent: vi.fn(() => () => undefined),
    onStatus: vi.fn(() => () => undefined),
  };
  const link = createTwitchLink({
    bridge: () => bridge as never,
    gate: { submit, snapshot: () => ({ actions: [{ id: 'quill.hop', label: 'Quill hops' }] }) },
    kinds: () => ['follow'],
    rules: () => [rule],
    setStatus: (s) => statuses.push(s),
    turnedAway: (label, reason) => told.push(`${label}:${reason}`),
  });
  return { link, log, told, bridge, submit, statuses, resolveListen: (s: TwitchStatus) => resolveListen(s) };
};

describe('the Twitch link', () => {
  it('an open followed at once by a close ends closed, whatever order the answers come back in', async () => {
    const t = build();
    t.link.open();
    t.link.close();
    t.resolveListen(signedOutStatus());
    await new Promise((r) => setTimeout(r, 5));
    expect(t.log).toEqual(['stop']);
  });
  it('tells when the gate turned a link away, by the action\'s label and the reason, never a name', () => {
    const t = build({ ok: false, reason: 'cooldown' });
    t.link.hear({ kind: 'follow' });
    expect(t.told).toEqual(['Quill hops:cooldown']);
  });
  it('says nothing when it ran, and does nothing for an event no link wants', () => {
    const t = build();
    t.link.hear({ kind: 'follow' });
    t.link.hear({ kind: 'raid', viewers: 4 });
    expect(t.told).toEqual([]);
    expect(t.submit).toHaveBeenCalledTimes(1);
  });
  it('does nothing without a desktop side', () => {
    const link = createTwitchLink({ bridge: () => null, gate: { submit: () => ({ ok: true, outcome: 'ran' }), snapshot: () => ({ actions: [] }) }, kinds: () => [], rules: () => [], setStatus: () => undefined, turnedAway: () => undefined });
    link.open();
    link.close();
    expect(link.listen()()).toBeUndefined();
  });
});
