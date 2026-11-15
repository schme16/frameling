// @vitest-environment jsdom
// Twitch in the app: a feature on the audience gate, opened and closed by the gate's switch, with a pretend desktop
// side. Each event reaches its action through the gate, and the gate refuses what it should.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setChoice, setChoiceAsker } from '../../src/core/choices';
import { getCommand, getHelp } from '../../src/core/registry';
import { store } from '../../src/core/store';
import { audience, installAudience, registerAudienceAction, setAudienceDrawing, setAudienceOn } from '../../src/audience';
import { _resetFeaturesForTests, isFeatureOn, registerFeatures, setFeatureOn } from '../../src/features/host';
import { twitchFeature } from '../../src/twitch';
import { twitchLink } from '../../src/twitch/instance';
import { _resetTwitchState, setKinds, setRules, twitchSaved, twitchStatus } from '../../src/twitch/state';
import type { TwitchRule } from '../../src/twitch/rules';
import { signedOutStatus, type TwitchEvent, type TwitchStatus } from '../../src/shared/twitch';

installAudience();

const ran: { id: string; payload: unknown }[] = [];
let onEvent: ((e: TwitchEvent) => void) | null = null;
let onStatus: ((s: TwitchStatus) => void) | null = null;
const calls: string[] = [];
const signedIn = (): TwitchStatus => ({ ...signedOutStatus(), app: 'built-in', state: 'signed-in', login: 'quilltest', scopes: ['channel:read:redemptions'] });
const bridge = {
  status: vi.fn(async () => signedIn()),
  listen: vi.fn(async (kinds: string[]) => (calls.push(`listen ${kinds.join(',')}`), { ...signedIn(), listening: 'listening' as const })),
  stop: vi.fn(async () => void calls.push('stop')),
  onEvent: vi.fn((h: (e: TwitchEvent) => void) => ((onEvent = h), () => void (onEvent = null))),
  onStatus: vi.fn((h: (s: TwitchStatus) => void) => ((onStatus = h), () => void (onStatus = null))),
};
const settle = () => new Promise((r) => setTimeout(r, 5));
const rule = (p: Partial<TwitchRule> & Pick<TwitchRule, 'event' | 'action'>): TwitchRule => ({ id: `t-${Math.random()}`, on: true, ...p });

beforeAll(() => {
  vi.useFakeTimers({ now: Date.now() + 120_000, toFake: ['Date'] });
  setChoiceAsker(null);
  setChoice('audience.strictness', 'relaxed');
  (window as unknown as { frameling: unknown }).frameling = { files: {}, twitch: bridge };
  _resetFeaturesForTests();
  registerFeatures([twitchFeature]);
  // Stand-ins for what a Twitch event can drive.
  registerAudienceAction({ id: 'tw.view', label: 'A view action', kind: 'a', cooldown: 0, run: () => void ran.push({ id: 'tw.view', payload: undefined }) });
  registerAudienceAction({ id: 'tw.slow', label: 'A slow one', kind: 'slow', cooldown: 60_000, run: () => void ran.push({ id: 'tw.slow', payload: undefined }) });
  registerAudienceAction({ id: 'tw.draw', label: 'A drawing action', kind: 'b', cooldown: 0, touchesDrawing: true, run: (_p, ctx) => (ran.push({ id: 'tw.draw', payload: undefined }), ctx.edit?.('x', () => undefined)) });
  registerAudienceAction<{ text: string }>({
    id: 'tw.words',
    label: 'Takes words',
    kind: 'c',
    cooldown: 0,
    parse: (raw) => (typeof raw === 'string' && raw.trim() ? { text: raw.replace(/[^a-z ]/gi, '').slice(0, 30) } : null),
    run: (p) => void ran.push({ id: 'tw.words', payload: p }),
  });
});
afterAll(() => {
  vi.useRealTimers();
  setAudienceOn(false);
  delete (window as unknown as { frameling?: unknown }).frameling;
});
beforeEach(async () => {
  audience.kill();
  audience.resetCounts();
  audience.setDrawingAllowed(false);
  for (const id of ['tw.slow']) audience.setActionEnabled(id, true);
  _resetTwitchState();
  twitchStatus.set(signedIn());
  localStorage.clear();
  vi.setSystemTime(Date.now() + 120_000);
  await settle();
  ran.length = 0;
  calls.length = 0;
  bridge.listen.mockClear();
  bridge.stop.mockClear();
});
const on = async () => {
  setAudienceOn(true);
  await settle();
};
// The gate keeps a gap between actions, so each event comes a little later than the last; a burst does not.
const fire = (e: TwitchEvent) => (vi.setSystemTime(Date.now() + 2000), onEvent!(e));
const burst = (e: TwitchEvent) => onEvent!(e);

describe('the door', () => {
  it('is registered on the gate as Twitch, and listens only while the switch is on', async () => {
    expect(audience.snapshot().doors.map((d) => d.id)).toContain('door.twitch');
    expect(bridge.listen).not.toHaveBeenCalled();
    await on();
    expect(calls).toEqual(['listen redemption,raid']);
    setAudienceOn(false);
    await settle();
    expect(calls).toEqual(['listen redemption,raid', 'stop']);
  });
  it('is closed by Stop', async () => {
    await on();
    audience.kill();
    await settle();
    expect(calls.at(-1)).toBe('stop');
  });
  it('listens for the kinds that are ticked, and again when they change', async () => {
    setKinds(['cheer', 'follow']);
    await on();
    expect(calls).toEqual(['listen cheer,follow']);
    setKinds(['sub']);
    twitchLink.refresh();
    await settle();
    expect(calls.slice(-2)).toEqual(['stop', 'listen sub']);
  });
  it('goes with the feature: off, there is no door and no command, and the line is closed', async () => {
    await on();
    setFeatureOn('stream-twitch', false);
    await settle();
    expect(audience.snapshot().doors.map((d) => d.id)).not.toContain('door.twitch');
    expect(getCommand('twitch.connect')).toBeUndefined();
    expect(calls.at(-1)).toBe('stop');
    setFeatureOn('stream-twitch', true);
    expect(isFeatureOn('stream-twitch')).toBe(true);
    expect(getCommand('twitch.connect')).toBeTruthy();
    expect(audience.snapshot().doors.map((d) => d.id)).toContain('door.twitch');
  });
});

describe('each kind of event reaches its action through the gate', () => {
  const cases: [string, TwitchEvent][] = [
    ['redemption', { kind: 'redemption', rewardId: 'rw', rewardTitle: 'r' }],
    ['cheer', { kind: 'cheer', bits: 100 }],
    ['follow', { kind: 'follow' }],
    ['sub', { kind: 'sub', resub: false }],
    ['raid', { kind: 'raid', viewers: 9 }],
  ];
  for (const [name, e] of cases)
    it(`${name} runs its action`, async () => {
      setRules([rule({ event: e.kind, action: 'tw.view' })]);
      await on();
      fire(e);
      expect(ran).toEqual([{ id: 'tw.view', payload: undefined }]);
      expect(audience.snapshot().counts.ran).toBe(1);
    });
  it('runs only the links that match, and only the one reward chosen', async () => {
    setRules([rule({ event: 'redemption', action: 'tw.view', rewardId: 'rw2' }), rule({ event: 'raid', action: 'tw.view', min: 50 })]);
    await on();
    fire({ kind: 'redemption', rewardId: 'rw1', rewardTitle: 'x' });
    fire({ kind: 'raid', viewers: 49 });
    expect(ran).toEqual([]);
    fire({ kind: 'redemption', rewardId: 'rw2', rewardTitle: 'y' });
    expect(ran).toHaveLength(1);
  });
  it('sends fixed words, or the viewer\'s words cleaned by the action when asked, and never the viewer\'s by default', async () => {
    setRules([rule({ event: 'follow', action: 'tw.words', text: 'thanks' }), rule({ event: 'redemption', action: 'tw.words', useViewerText: true }), rule({ event: 'sub', action: 'tw.words', text: 'fixed' })]);
    await on();
    fire({ kind: 'follow' });
    fire({ kind: 'redemption', rewardId: 'r', rewardTitle: 't', text: 'a frog!!! <in> a cup' });
    fire({ kind: 'sub', resub: false });
    expect(ran.map((r) => r.payload)).toEqual([{ text: 'thanks' }, { text: 'a frog in a cup' }, { text: 'fixed' }]);
  });
  it('a link with no words to send an action that needs them is refused by the action, not run', async () => {
    setRules([rule({ event: 'follow', action: 'tw.words' })]);
    await on();
    fire({ kind: 'follow' });
    expect(ran).toEqual([]);
    expect(audience.snapshot().counts.rejected.invalid).toBe(1);
  });
});

describe('the gate still has the last word', () => {
  it('refuses everything while audience features are off', async () => {
    setRules([rule({ event: 'follow', action: 'tw.view' })]);
    await on();
    const hear = onEvent!;
    setAudienceOn(false);
    await settle();
    expect(hear).toBeTruthy();
    const v = twitchLink.hear({ kind: 'follow' });
    expect(v).toEqual([{ ok: false, reason: 'off' }]);
    expect(ran).toEqual([]);
  });
  it('applies the cooldown of the action\'s kind', async () => {
    setRules([rule({ event: 'follow', action: 'tw.slow' })]);
    await on();
    fire({ kind: 'follow' });
    fire({ kind: 'follow' });
    expect(ran).toHaveLength(1);
    expect(audience.snapshot().counts.rejected.cooldown).toBe(1);
  });
  it('queues past the rate limit instead of running it all at once', async () => {
    setRules([rule({ event: 'follow', action: 'tw.view' })]);
    await on();
    for (let i = 0; i < 5; i++) burst({ kind: 'follow' });
    expect(ran.length).toBeLessThan(5);
    expect(audience.snapshot().queue.length + ran.length).toBe(5);
  });
  it('turns away an action that reaches the drawing until the interrupt switch is on', async () => {
    setRules([rule({ event: 'raid', action: 'tw.draw' })]);
    await on();
    fire({ kind: 'raid', viewers: 3 });
    expect(ran).toEqual([]);
    expect(audience.snapshot().counts.rejected.unavailable).toBe(1);
    setAudienceDrawing(true);
    fire({ kind: 'raid', viewers: 3 });
    expect(ran).toEqual([{ id: 'tw.draw', payload: undefined }]);
  });
  it('turns away an action the streamer switched off, and one that is not there', async () => {
    setRules([rule({ event: 'follow', action: 'tw.slow' }), rule({ event: 'follow', action: 'gone.away' })]);
    await on();
    audience.setActionEnabled('tw.slow', false);
    fire({ kind: 'follow' });
    expect(ran).toEqual([]);
    expect(audience.snapshot().counts.rejected.unavailable).toBe(1);
    expect(audience.snapshot().counts.rejected.unknown).toBe(1);
  });
  it('Stop empties the queue of waiting Twitch events', async () => {
    setRules([rule({ event: 'follow', action: 'tw.view' })]);
    await on();
    for (let i = 0; i < 6; i++) burst({ kind: 'follow' });
    audience.kill();
    expect(audience.snapshot().queue).toEqual([]);
  });
  it('Try it goes through the gate too', async () => {
    const r = rule({ event: 'follow', action: 'tw.view' });
    setRules([r]);
    expect(twitchLink.test(r)).toEqual({ ok: false, reason: 'off' });
    await on();
    expect(twitchLink.test(r)).toMatchObject({ ok: true });
  });
});

describe('what is kept', () => {
  it('nothing about a viewer reaches storage, the gate\'s snapshot or the saved links', async () => {
    setRules([rule({ event: 'redemption', action: 'tw.words', useViewerText: true }), rule({ event: 'raid', action: 'tw.view' })]);
    await on();
    fire({ kind: 'redemption', rewardId: 'r', rewardTitle: 'Draw', text: 'zebra' });
    fire({ kind: 'raid', viewers: 31 });
    const kept = JSON.stringify({ ...localStorage }) + JSON.stringify(audience.snapshot()) + JSON.stringify(twitchSaved.get());
    expect(kept).not.toContain('zebra');
    expect(kept).not.toMatch(/token|device|ViewerName/i);
    // What the page holds about the connection is a status: no token field exists on it.
    expect(Object.keys(twitchStatus.get()).sort()).toEqual(['app', 'canSave', 'listening', 'login', 'problem', 'refused', 'scopes', 'state']);
  });
});

describe('the first connection', () => {
  it('offers the starter links once, and fills them in only for the actions that exist', async () => {
    registerAudienceAction({ id: 'quill.wave', label: 'Quill waves hello', kind: 'quill', cooldown: 0, run: () => undefined });
    setChoice('twitch.starter', 'suggest');
    twitchStatus.set({ ...signedOutStatus(), app: 'built-in', state: 'signing-in' });
    twitchStatus.set(signedIn());
    await settle();
    expect(twitchSaved.get().seeded).toBe(true);
    expect(twitchSaved.get().rules.map((r) => `${r.event}:${r.action}`)).toEqual(['raid:quill.wave']);
    // Signing in again does not offer them again.
    setRules([]);
    twitchStatus.set({ ...signedOutStatus(), app: 'built-in', state: 'signing-in' });
    twitchStatus.set(signedIn());
    await settle();
    expect(twitchSaved.get().rules).toEqual([]);
  });
  it('an empty list when that is the answer', async () => {
    setChoice('twitch.starter', 'empty');
    twitchStatus.set({ ...signedOutStatus(), app: 'built-in', state: 'signing-in' });
    twitchStatus.set(signedIn());
    await settle();
    expect(twitchSaved.get().rules).toEqual([]);
  });
});

describe('the feature\'s commands and help', () => {
  it('has a command for connect, cancel, disconnect and the links, each pointing at a help topic that exists', () => {
    for (const id of ['twitch.connect', 'twitch.cancel', 'twitch.disconnect', 'twitch.links']) {
      const c = getCommand(id);
      expect(c, id).toBeTruthy();
      expect(getHelp(c!.help!), `${id} help`).toBeTruthy();
    }
  });
  it('connect is only offered when signed out, disconnect only when not', () => {
    twitchStatus.set(signedOutStatus());
    expect(getCommand('twitch.connect')!.enabled?.(store().get())).toBe(true);
    expect(getCommand('twitch.disconnect')!.enabled?.(store().get())).toBe(false);
    twitchStatus.set(signedIn());
    expect(getCommand('twitch.connect')!.enabled?.(store().get())).toBe(false);
    expect(getCommand('twitch.disconnect')!.enabled?.(store().get())).toBe(true);
  });
});
