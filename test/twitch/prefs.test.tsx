// @vitest-environment jsdom
// The Twitch block on the settings screen: the code is drawn only with stream-safe mode off and fetched only then, the
// buttons do what they say, and the links can be added, changed, tried and removed.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setStreamSafe } from '../../src/core/streamSafe';
import { setChoice, setChoiceAsker } from '../../src/core/choices';
import { audience, installAudience, registerAudienceAction, setAudienceOn } from '../../src/audience';
import { _resetFeaturesForTests, registerFeatures } from '../../src/features/host';
import { twitchFeature } from '../../src/twitch';
import { TwitchPrefsRow } from '../../src/twitch/PrefsRow';
import { _resetTwitchState, setRules, twitchSaved, twitchStatus } from '../../src/twitch/state';
import { signedOutStatus, type TwitchStatus } from '../../src/shared/twitch';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
installAudience();

const CODE = 'QZXWVBNM';
let host: HTMLDivElement;
let root: Root;
const ran: string[] = [];
const bridge = {
  status: vi.fn(async () => signedOutStatus()),
  signIn: vi.fn(async (): Promise<TwitchStatus> => ({ ...signedOutStatus(), app: 'built-in', state: 'signing-in' })),
  code: vi.fn(async () => ({ userCode: CODE, expiresAt: Date.now() + 1000 })),
  openApproval: vi.fn(async () => true),
  copyApproval: vi.fn(async () => true),
  cancelSignIn: vi.fn(async () => undefined),
  signOut: vi.fn(async () => ({ revoked: true })),
  listen: vi.fn(async () => signedOutStatus()),
  stop: vi.fn(async () => undefined),
  rewards: vi.fn(async () => ({ ok: true as const, rewards: [{ id: 'rw1', title: 'Hydrate', cost: 100 }] })),
  setApp: vi.fn(async () => signedOutStatus()),
  onStatus: vi.fn(() => () => undefined),
  onEvent: vi.fn(() => () => undefined),
};
const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="twitch.${id}"]`);
const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));
const click = async (id: string) => {
  await act(async () => q(id)!.click());
  await flush();
};
const change = async (el: HTMLElement, value: string) => {
  await act(async () => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
};
const waiting = (): TwitchStatus => ({ ...signedOutStatus(), app: 'built-in', state: 'signing-in' });
const connected = (): TwitchStatus => ({ ...signedOutStatus(), app: 'built-in', state: 'signed-in', login: 'quilltest', scopes: ['channel:read:redemptions'] });

beforeAll(() => {
  setChoiceAsker(null);
  registerAudienceAction({ id: 'tp.view', label: 'A view action', kind: 'tp', cooldown: 0, run: () => void ran.push('view') });
  registerAudienceAction({ id: 'tp.draw', label: 'A drawing action', kind: 'tp2', cooldown: 0, touchesDrawing: true, run: () => undefined });
  registerAudienceAction<string>({ id: 'tp.words', label: 'Takes words', kind: 'tp3', cooldown: 0, parse: (r) => (typeof r === 'string' ? r : null), run: () => undefined });
});
beforeEach(async () => {
  localStorage.clear();
  setChoiceAsker(null);
  setChoice('audience.strictness', 'relaxed');
  Object.values(bridge).forEach((f) => (f as { mockClear?: () => void }).mockClear?.());
  (window as unknown as { frameling: unknown }).frameling = { files: {}, twitch: bridge, clipboard: { writeText: async () => true } };
  _resetFeaturesForTests();
  registerFeatures([twitchFeature]);
  _resetTwitchState();
  ran.length = 0;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<TwitchPrefsRow />));
});
afterEach(async () => {
  setStreamSafe(false);
  setAudienceOn(false);
  audience.kill();
  await act(async () => root.unmount());
  host.remove();
  _resetTwitchState();
  delete (window as unknown as { frameling?: unknown }).frameling;
});

describe('connecting', () => {
  it('starts with what to hear about, rewards and raids ticked, and a Connect button', () => {
    twitchStatus.set({ ...signedOutStatus(), app: 'built-in' });
    expect((q('kind.redemption') as HTMLInputElement).checked).toBe(true);
    expect((q('kind.raid') as HTMLInputElement).checked).toBe(true);
    expect((q('kind.cheer') as HTMLInputElement).checked).toBe(false);
    expect(host.textContent).toContain('channel:read:redemptions');
  });
  it('Connect asks for the ticked kinds, and shows the code with Open, Copy and Cancel', async () => {
    twitchStatus.set({ ...signedOutStatus(), app: 'built-in' });
    await flush();
    await click('connect');
    expect(bridge.signIn).toHaveBeenCalledWith(['redemption', 'raid']);
    expect(q('code')!.textContent).toBe(CODE);
    await click('open');
    expect(bridge.openApproval).toHaveBeenCalled();
    await click('copyLink');
    expect(bridge.copyApproval).toHaveBeenCalled();
    await click('cancel');
    expect(bridge.cancelSignIn).toHaveBeenCalled();
  });
  it('cannot connect with no Twitch app, and says how to get one', async () => {
    twitchStatus.set(signedOutStatus());
    await flush();
    expect((q('connect') as HTMLButtonElement).disabled).toBe(true);
    expect(host.textContent).toContain('no Twitch app');
  });
});

describe('stream-safe mode and the code', () => {
  it('never draws the code, and never even asks for it', async () => {
    setStreamSafe(true);
    await act(async () => twitchStatus.set(waiting()));
    await flush();
    expect(bridge.code).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain(CODE);
    expect(q('code')!.textContent).toMatch(/^•+$/);
    expect(host.textContent).toContain('isn\'t shown');
    // It can still be done: open the page or copy the link, neither of which draws anything.
    await click('open');
    await click('copyLink');
    expect(bridge.openApproval).toHaveBeenCalled();
    expect(bridge.copyApproval).toHaveBeenCalled();
    expect(host.innerHTML).not.toContain(CODE);
  });
  it('takes the code off the screen the moment stream-safe mode goes on', async () => {
    await act(async () => twitchStatus.set(waiting()));
    await flush();
    expect(host.textContent).toContain(CODE);
    await act(async () => setStreamSafe(true));
    await flush();
    expect(host.innerHTML).not.toContain(CODE);
    await act(async () => setStreamSafe(false));
    await flush();
    expect(host.textContent).toContain(CODE);
  });
  it('shows the streamer\'s own name as the stand-in while stream-safe is on', async () => {
    await act(async () => twitchStatus.set(connected()));
    expect(host.textContent).toContain('quilltest');
    await act(async () => setStreamSafe(true));
    expect(host.textContent).not.toContain('quilltest');
  });
  it('no token or device code is anywhere on the screen, safe mode or not', async () => {
    await act(async () => twitchStatus.set(connected()));
    expect(host.innerHTML).not.toMatch(/access-|refresh-|DEV-SECRET/);
  });
});

describe('connected', () => {
  beforeEach(async () => {
    await act(async () => twitchStatus.set(connected()));
    await flush();
  });
  it('says who, with one obvious Disconnect that signs out for real', async () => {
    expect(q('status')!.textContent).toContain('Connected as quilltest');
    await click('disconnect');
    expect(bridge.signOut).toHaveBeenCalled();
  });
  it('offers to ask for one more permission when a kind is ticked that the sign-in lacks', async () => {
    expect(q('morePermissions')).toBeNull();
    await click('kind.cheer');
    expect(q('morePermissions')!.textContent).toContain('one more permission');
    await click('morePermissions');
    expect(bridge.signIn).toHaveBeenCalledWith(['redemption', 'cheer', 'raid']);
  });
  it('lists the reward names for the picker', async () => {
    await click('addLink');
    const id = twitchSaved.get().rules[0].id;
    const reward = q(`rule.${id}.reward`) as HTMLSelectElement;
    expect([...reward.options].map((o) => o.text)).toEqual(['Any reward', 'Hydrate (100)']);
    await change(reward, 'rw1');
    expect(twitchSaved.get().rules[0]).toMatchObject({ rewardId: 'rw1', rewardTitle: 'Hydrate' });
  });
  it('says so when the channel cannot use channel points', async () => {
    bridge.rewards.mockResolvedValueOnce({ ok: false, why: 'not-affiliate' } as never);
    await act(async () => twitchStatus.set({ ...connected(), refused: ['redemption'] }));
    expect(q('refused')!.textContent).toContain('Affiliate or Partner');
  });
});

describe('the links', () => {
  it('adds a link pointing at a view-only action, and lists the actions in two groups', async () => {
    await click('addLink');
    const r = twitchSaved.get().rules[0];
    expect(r.action).toBe('tp.view');
    const sel = q(`rule.${r.id}.action`) as HTMLSelectElement;
    const groups = [...sel.querySelectorAll('optgroup')].map((g) => g.label);
    expect(groups).toEqual(['Only changes the view', 'Reaches your drawing']);
    expect(sel.textContent).toContain('needs the interrupt switch');
  });
  it('changes the event and the action, clearing filters that belong to the old kind', async () => {
    setRules([{ id: 'x', event: 'redemption', action: 'tp.view', rewardId: 'rw1', rewardTitle: 'Hydrate', on: true }]);
    await flush();
    await change(q('rule.x.event')!, 'cheer');
    expect(twitchSaved.get().rules[0]).toEqual({ id: 'x', event: 'cheer', action: 'tp.view', on: true });
    await change(q('rule.x.min')!, '500');
    expect(twitchSaved.get().rules[0].min).toBe(500);
    await change(q('rule.x.action')!, 'tp.draw');
    expect(twitchSaved.get().rules[0].action).toBe('tp.draw');
  });
  it('shows a words box only for an action that takes words, and the viewer-words tick only for rewards', async () => {
    setRules([{ id: 'x', event: 'redemption', action: 'tp.view', on: true }]);
    await flush();
    expect(q('rule.x.text')).toBeNull();
    await change(q('rule.x.action')!, 'tp.words');
    expect(q('rule.x.text')).toBeTruthy();
    expect(q('rule.x.viewerText')).toBeTruthy();
    await change(q('rule.x.event')!, 'follow');
    expect(q('rule.x.viewerText')).toBeNull();
  });
  it('switches a link off, tries it through the gate, and removes it', async () => {
    setRules([{ id: 'x', event: 'follow', action: 'tp.view', on: true }]);
    await flush();
    await click('rule.x.try');
    expect(ran).toEqual([]);
    setChoice('audience.strictness', 'relaxed');
    setAudienceOn(true);
    await flush();
    await click('rule.x.try');
    expect(ran).toEqual(['view']);
    await click('rule.x.on');
    expect(twitchSaved.get().rules[0].on).toBe(false);
    await click('rule.x.remove');
    expect(twitchSaved.get().rules).toEqual([]);
  });
  it('keeps a link whose action has gone, and says so, rather than dropping it', async () => {
    setRules([{ id: 'x', event: 'follow', action: 'some.gone', on: true }]);
    await flush();
    expect((q('rule.x.action') as HTMLSelectElement).textContent).toContain('some.gone (not available)');
  });
});
