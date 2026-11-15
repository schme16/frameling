// @vitest-environment jsdom
// Preferences > Features: the streaming family sits under one heading, with the audience note said once, folded for
// somebody who does not stream, open for one who does, and a search that points inside it opens it.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../src/renderer/features';
import { audience } from '../../src/audience';
import { FeaturesPage } from '../../src/features/FeaturesPage';
import { setStreaming, STREAM_FEATURES } from '../../src/features/streamFamily';
import { lightRow } from '../../src/ui/prefsLight';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
const render = async () => {
  await act(async () => {
    root.render(<FeaturesPage />);
  });
};
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

describe('Preferences > Features, the streaming group', () => {
  it('has one Streaming heading with the master switch, and every stream switch and detail block inside it', async () => {
    await render();
    expect(group().querySelector('h3')?.textContent).toBe('Streaming');
    expect(group().querySelector('[data-testid="streaming-switch"]')).not.toBeNull();
    for (const id of STREAM_FEATURES) expect(group().querySelector(`[data-testid="feature-switch-${id}"]`), id).not.toBeNull();
    for (const t of ['audience.prefs', 'dares.prefs']) expect(group().querySelector(`[data-testid="${t}"]`), t).not.toBeNull();
    // Nothing of the family is left in the plain list above or below it.
    const outside = [...host.querySelectorAll('[data-testid^="feature-switch-"]')].filter((el) => !group().contains(el));
    expect(outside.some((el) => STREAM_FEATURES.some((id) => el.getAttribute('data-testid') === `feature-switch-${id}`))).toBe(false);
    expect(host.querySelectorAll('h3').length).toBe(2);
  });

  it('says once that none of it does anything until audience features are on, and not on every row', async () => {
    await render();
    expect(group().querySelector('[data-testid="streaming-status"]')!.textContent).toContain('Audience features are off, so none of these does anything yet');
    expect(host.textContent).not.toContain('Only while audience features are on');
  });

  it('is folded while audience features are off and open once they are on', async () => {
    await render();
    expect(fold().hasAttribute('open')).toBe(false);
    await act(async () => audience.setOn(true));
    expect(fold().hasAttribute('open')).toBe(true);
    expect(group().querySelector('[data-testid="streaming-status"]')!.textContent).toBe('Audience features are on.');
  });

  it('opens when a search points at a row inside it', async () => {
    await render();
    expect(fold().hasAttribute('open')).toBe(false);
    let stop = () => {};
    await act(async () => {
      stop = lightRow(host, 'Pen modifiers');
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(fold().hasAttribute('open')).toBe(true);
    stop();
  });
});
