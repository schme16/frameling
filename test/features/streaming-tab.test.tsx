// @vitest-environment jsdom
// Preferences > Streaming: one tab with every streaming setting on it, the master switch first, the nine folded under it,
// the sharing settings that stay for anybody, and a way back when the family is tucked away. Preferences > Features only
// points at it. A search that points at a row inside the fold opens it.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../src/renderer/features';
import { audience } from '../../src/audience';
import { allChoices } from '../../src/core/choices';
import { FeaturesPage } from '../../src/features/FeaturesPage';
import { StreamingPage } from '../../src/features/StreamingPage';
import { setStreaming, STREAM_FEATURES } from '../../src/features/streamFamily';
import { isStreamingChoice } from '../../src/features/streamIds';
import { BehaviourPage } from '../../src/ui/ChoiceDialog';
import { PAGES } from '../../src/ui/PrefsModal';
import { allPrefRows } from '../../src/ui/prefsIndex';
import { lightRow } from '../../src/ui/prefsLight';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const render = async (node: React.ReactNode) => {
  await act(async () => {
    root.render(node);
  });
};
const tab = () => render(<StreamingPage sharing={<div data-testid="sharing-rows">Stream-safe mode</div>} />);
const group = () => host.querySelector<HTMLElement>('[data-testid="features-streaming"]')!;
const fold = () => group().querySelector('details')!;

beforeEach(() => {
  localStorage.clear();
  setStreaming(true, { remember: false });
  audience.setOn(false);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  audience.setOn(false);
  setStreaming(true, { remember: false });
  localStorage.clear();
});

describe('the Streaming tab', () => {
  it('is a tab of its own, with its own icon and a help topic that exists', () => {
    const p = PAGES.find((x) => x.id === 'streaming')!;
    expect(p.label).toBe('Streaming');
    expect(p.icon).toBe('live');
    expect(p.help).toBe('streaming');
  });

  it('has the master switch, every stream switch, every detail block and the sharing rows', async () => {
    await tab();
    expect(host.querySelector('h3')?.textContent).toBe('Streaming');
    // The master switch is opposite the title, not down in the folded group.
    expect(host.querySelector('.ui-pref-title-head h3')?.textContent).toBe('Streaming');
    expect(host.querySelector('.ui-pref-title-head [data-testid="streaming-switch"]')).not.toBeNull();
    expect(group().querySelector('[data-testid="streaming-switch"]')).toBeNull();
    for (const id of STREAM_FEATURES) expect(group().querySelector(`[data-testid="feature-switch-${id}"]`), id).not.toBeNull();
    for (const t of ['audience.prefs', 'dares.prefs', 'audience.switch', 'audience.drawing']) expect(group().querySelector(`[data-testid="${t}"]`), t).not.toBeNull();
    expect(host.querySelector('[data-testid="streaming-sharing"] [data-testid="sharing-rows"]')).not.toBeNull();
  });

  it('has the remembered answers of the streaming tools, and none of them stays on Behaviour', async () => {
    await tab();
    const mine = allChoices().filter(isStreamingChoice);
    expect(mine.length).toBeGreaterThan(10);
    for (const c of mine) expect(host.querySelector(`[data-testid="choice-row-${c.id}"]`), c.id).not.toBeNull();
    // The strictness choice is one of them, and the capture view's three.
    for (const id of ['audience.strictness', 'popout.captureBackground', 'popout.captureCursor', 'popout.captureSize', 'stream.golive.stop']) expect(mine.map((c) => c.id), id).toContain(id);
    await render(<BehaviourPage />);
    for (const c of mine) expect(host.querySelector(`[data-testid="choice-row-${c.id}"]`), c.id).toBeNull();
    expect(host.textContent).toContain('Second window and the camera');
  });

  it('says once that none of it does anything until audience features are on, and not on every row', async () => {
    await tab();
    expect(host.querySelector('[data-testid="streaming-status"]')!.textContent).toContain('Audience features are off, so none of these does anything yet');
    expect(host.textContent).not.toContain('Only while audience features are on');
  });

  it('is folded while audience features are off and open once they are on', async () => {
    await tab();
    expect(fold().hasAttribute('open')).toBe(false);
    await act(async () => audience.setOn(true));
    expect(fold().hasAttribute('open')).toBe(true);
    expect(host.querySelector('[data-testid="streaming-status"]')!.textContent).toBe('Audience features are on.');
  });

  it('puts the audience features switch opposite its group title, and says what off means', async () => {
    await tab();
    const head = host.querySelector('[data-testid="audience.prefs"] .ui-pref-title-head')!;
    expect(head.querySelector('h4')?.textContent).toBe('Audience features');
    const sw = head.querySelector('[data-testid="audience.switch"]')!;
    expect(sw.getAttribute('aria-label')).toBe('Audience features on or off');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(host.querySelector('[data-testid="audience.prefs"] .ui-pref-title-status')!.textContent).toContain('Nothing from your viewers');
    // Switching it on asks its first-time questions, so the test turns it on directly.
    await act(async () => audience.setOn(true));
    expect(host.querySelector('[data-testid="audience.prefs"] .ui-pref-title-status')!.textContent).toMatch(/^On\./);
  });

  it('opens when a search points at a row inside it', async () => {
    await tab();
    expect(fold().hasAttribute('open')).toBe(false);
    let stop = () => {};
    await act(async () => {
      stop = lightRow(host, 'Pen modifiers');
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(fold().hasAttribute('open')).toBe(true);
    stop();
  });

  it('tucked away: says so, keeps the switch (the way back) and the sharing rows, and the switch brings it all back', async () => {
    setStreaming(false, { remember: false });
    await tab();
    const status = host.querySelector('[data-testid="streaming-status"]')!.textContent!;
    expect(status).toContain('tucked away');
    expect(status).toContain('bring them all back');
    const sw = host.querySelector<HTMLElement>('[data-testid="streaming-switch"]')!;
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(host.querySelector('[data-testid="sharing-rows"]')).not.toBeNull();
    // Each of the nine can still be picked one by one.
    for (const id of STREAM_FEATURES) expect(host.querySelector(`[data-testid="feature-switch-${id}"]`), id).not.toBeNull();
    await act(async () => void sw.click());
    expect(host.querySelector('[data-testid="streaming-switch"]')!.getAttribute('aria-checked')).toBe('true');
  });
});

describe('Preferences > Features, with Streaming on a tab of its own', () => {
  it('lists none of the streaming tools, and has one row that opens the tab', async () => {
    await render(<FeaturesPage />);
    for (const id of STREAM_FEATURES) expect(host.querySelector(`[data-testid="feature-switch-${id}"]`), id).toBeNull();
    expect(host.querySelector('[data-testid="streaming-switch"]')).toBeNull();
    expect(host.querySelector('[data-testid="audience.prefs"]')).toBeNull();
    expect(host.querySelector('[data-testid="features-open-streaming"]')).not.toBeNull();
  });
});

describe('searching Preferences finds the streaming settings on the tab', () => {
  it('points every streaming row at the Streaming page, and none at General or Features', () => {
    const rows = allPrefRows();
    for (const label of ['Streaming tools', 'Audience features', 'Actions door', 'Let the audience interrupt your drawing', 'Pen modifiers', 'Stream-safe mode', 'Going live with OBS']) {
      expect(rows.find((r) => r.label === label)?.page, label).toBe('streaming');
    }
    for (const id of STREAM_FEATURES) expect(rows.find((r) => r.id === `features.${id}`)?.page, id).toBe('streaming');
    for (const id of ['audience.strictness', 'popout.captureBackground', 'popout.captureCursor', 'popout.captureSize']) expect(rows.find((r) => r.id === `behaviour.${id}`)?.page, id).toBe('streaming');
    expect(rows.filter((r) => r.page === 'features' && /stream|audience|twitch|dares|votes|jar/i.test(r.label))).toEqual([]);
  });
});
