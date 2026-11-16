// @vitest-environment jsdom
// The Live pill, drawn: everything that used to be a pill of its own is still one press away. Turning audience
// participation off, the queue and the
// counts, the OBS settings, the OBS retry. Nothing is there when everything is off.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ObsState } from '../../src/streamsafe/obsLogic';

const state: { s: ObsState } = { s: { link: 'off', streaming: false, recording: false, safe: false, owns: false, tries: 0 } };
const lookNow = vi.fn();
const openPrefs = vi.fn();
const openHelp = vi.fn();
vi.mock('../../src/streamsafe/obs', () => ({ obs: { lookNow: () => lookNow() }, useObsState: () => state.s }));
vi.mock('../../src/ui/overlays', async (orig) => ({ ...(await orig<typeof import('../../src/ui/overlays')>()), openPrefs: (...a: unknown[]) => openPrefs(...a), openHelp: (...a: unknown[]) => openHelp(...a) }));

import { audience, installAudience, registerAudienceAction, setAudienceOn, submitAudience } from '../../src/audience';
import { setChoice } from '../../src/core/choices';
import { cardOpen } from '../../src/audience/card';
import { getCommand } from '../../src/core/registry';
import { LivePill } from '../../src/ui/LivePill';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
installAudience();
registerAudienceAction({ id: 't.thing', label: 'A test thing', kind: 'quill', cooldown: 0, run: () => undefined });

let host: HTMLDivElement;
let root: Root;
const draw = () => act(() => root.render(<LivePill />));
const q = (id: string) => host.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const press = (el: Element | null) => act(() => void (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })));
const obsIs = (over: Partial<ObsState>) => {
  state.s = { ...state.s, ...over };
};
const audienceOn = (waiting = 0) => {
  setChoice('audience.strictness', 'balanced');
  act(() => setAudienceOn(true));
  for (let i = 0; i < waiting; i++) submitAudience('t.thing');
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => audience.kill());
  cardOpen.set(false);
  state.s = { link: 'off', streaming: false, recording: false, safe: false, owns: false, tries: 0 };
  lookNow.mockClear();
  openPrefs.mockClear();
  openHelp.mockClear();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  act(() => audience.kill());
});

describe('the Live pill, drawn', () => {
  it('is not in the page at all when everything is off', () => {
    draw();
    expect(host.querySelector('.live-pill')).toBeNull();
  });

  it('pressing the audience part turns audience participation off, and says so in words', () => {
    audienceOn(2);
    obsIs({ link: 'connected', streaming: true });
    draw();
    expect(q('audience.pill')!.textContent).toBe('Audience participation: on');
    expect(q('audience.pill')!.getAttribute('aria-label')).toMatch(/turn it off/);
    expect(q('audience.pill')!.getAttribute('aria-haspopup')).toBeNull();
    expect(q('obs.badge')!.textContent).toBe('Live');
    press(q('audience.pill'));
    expect(audience.isOn()).toBe(false);
    expect(audience.snapshot().queue.length).toBe(0);
    // The press did not open the card.
    expect(q('audience.card')).toBeNull();
    draw();
    // Audience is off, so its parts go; OBS is still live, so the pill stays, with no audience part in it.
    expect(q('audience.pill')).toBeNull();
    expect(q('audience.more')).toBeNull();
    expect(q('obs.badge')).not.toBeNull();
  });

  it('keeps the waiting count visible on the arrow part, and just an arrow when nothing waits', () => {
    audienceOn(2);
    draw();
    const n = audience.snapshot().queue.length;
    expect(n).toBeGreaterThan(0);
    expect(q('audience.more')!.textContent).toContain(String(n));
    expect(q('audience.more')!.getAttribute('aria-label')).toMatch(new RegExp(`${n} waiting`));
    expect(q('audience.pill')!.textContent).not.toMatch(/\d/);
    act(() => void audience.clearQueue());
    draw();
    expect(q('audience.more')!.textContent).toBe('');
    expect(q('audience.more')!.querySelector('svg')).not.toBeNull();
  });

  it('the arrow part opens the card, the card has its own Switch off and Stop everything, and the kill command still works', () => {
    audienceOn(1);
    draw();
    press(q('audience.more'));
    expect(q('audience.card')).not.toBeNull();
    expect(q('audience.more')!.getAttribute('aria-expanded')).toBe('true');
    const buttons = [...host.querySelectorAll<HTMLElement>('.aud-card .ui-btn')].map((b) => b.textContent);
    expect(buttons).toEqual(expect.arrayContaining(['Switch off', 'Stop everything']));
    press([...host.querySelectorAll<HTMLElement>('.aud-card .ui-btn')].find((b) => b.textContent === 'Stop everything')!);
    expect(audience.isOn()).toBe(false);
    audienceOn(1);
    expect(audience.isOn()).toBe(true);
    act(() => void getCommand('audience.kill')!.run());
    expect(audience.isOn()).toBe(false);
  });

  it('opens the queue card from the OBS part and the arrow part, and the card carries the queue and the counts', () => {
    audienceOn(2);
    obsIs({ link: 'connected' });
    draw();
    press(q('obs.badge'));
    expect(q('audience.card')).not.toBeNull();
    expect(q('audience.queue')!.querySelectorAll('li').length).toBe(audience.snapshot().queue.length);
    expect(q('audience.counts')).not.toBeNull();
    press(q('audience.more'));
    expect(q('audience.card')).toBeNull();
    press(q('audience.more'));
    expect(q('audience.card')).not.toBeNull();
  });

  it('puts the OBS settings in the card, and presses through to the right page', () => {
    audienceOn();
    obsIs({ link: 'password' });
    draw();
    press(q('obs.badge'));
    expect(q('obs.line')!.textContent).toMatch(/password/);
    press(q('obs.settings'));
    expect(openPrefs).toHaveBeenCalledWith('streaming', 'stream.obsLink');
    expect(q('audience.card')).toBeNull();
  });

  it('keeps looking for OBS again one press away when OBS is not found, even with audience off', () => {
    obsIs({ link: 'waiting' });
    draw();
    expect(q('audience.pill')).toBeNull();
    press(q('obs.badge'));
    // With audience off the card is only about OBS.
    expect(q('audience.queue')).toBeNull();
    press(q('obs.lookNow'));
    expect(lookNow).toHaveBeenCalledTimes(1);
  });

  it('offers no retry button once connected, and the settings are still there', () => {
    obsIs({ link: 'connected' });
    draw();
    press(q('obs.badge'));
    expect(q('obs.lookNow')).toBeNull();
    expect(q('obs.settings')).not.toBeNull();
  });

  it('says in the card that turning audience participation off leaves the stream alone', () => {
    audienceOn();
    obsIs({ link: 'connected', streaming: true });
    draw();
    press(q('audience.more'));
    expect(q('obs.line')!.textContent).toMatch(/does not touch your stream/);
  });
});
