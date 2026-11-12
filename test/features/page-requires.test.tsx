// @vitest-environment jsdom
// Preferences > Features: a feature another feature needs shows its switch disabled, with the reason, instead of a toast.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineFeature } from '../../src/features/feature';
import { _resetFeaturesForTests, isFeatureOn, registerFeatures } from '../../src/features/host';
import { FeaturesPage } from '../../src/features/FeaturesPage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const base = defineFeature({ id: 'base', name: 'Base', about: 'The base.', optional: true });
const top = defineFeature({ id: 'top', name: 'Top bit', about: 'Needs the base.', optional: true, requires: ['base'] });

let host: HTMLDivElement;
let root: Root;
const render = async () => {
  await act(async () => {
    root.render(<FeaturesPage />);
  });
};
const sw = (name: string) => host.querySelector<HTMLButtonElement>(`[aria-label="${name} on or off"]`)!;

beforeEach(() => {
  localStorage.clear();
  _resetFeaturesForTests();
  registerFeatures([base, top]);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  _resetFeaturesForTests();
  localStorage.clear();
});

describe('the Features page', () => {
  it('disables the switch of a feature that is needed, with a plain note it is described by', async () => {
    await render();
    const b = sw('Base');
    expect(b.getAttribute('aria-disabled')).toBe('true');
    const note = host.querySelector(`#${b.getAttribute('aria-describedby')}`);
    expect(note?.textContent).toBe('Top bit needs this. Turn off Top bit first.');
    expect(note?.textContent).not.toContain('—');
    await act(async () => b.click());
    expect(isFeatureOn('base')).toBe(true);
    expect(document.querySelector('.ui-toast')).toBeNull();
  });

  it('leaves the other switch alone, and frees the first when the other is off', async () => {
    await render();
    expect(sw('Top bit').getAttribute('aria-disabled')).toBeNull();
    expect(sw('Top bit').getAttribute('aria-describedby')).toBeNull();
    await act(async () => sw('Top bit').click());
    expect(isFeatureOn('top')).toBe(false);
    expect(sw('Base').getAttribute('aria-disabled')).toBeNull();
    await act(async () => sw('Base').click());
    expect(isFeatureOn('base')).toBe(false);
  });
});
