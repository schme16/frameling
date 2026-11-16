// @vitest-environment jsdom
// First-run hello: someone who picked Tiles and levels while the Tiles feature is off is told why it is missing
// from the plan and can turn Tiles on, instead of being dropped silently.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetFeaturesForTests, isFeatureOn, registerFeatures, setFeatureOn } from '../../src/features/host';
import { tilesFeature } from '../../src/tiles';
import { INTEREST_FEATURE, INTERESTS, pickedButOff } from '../../src/ui/onboarding/flow';
import { OnboardingSheet } from '../../src/ui/onboarding/Onboarding';
import { closeOnboarding, openOnboarding } from '../../src/ui/overlays';
import { resetPrefs } from '../../src/ui/prefs';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('pickedButOff', () => {
  it('lists only the picks whose feature is off, in the order given', () => {
    expect(pickedButOff(['cartoons', 'tiles'], () => false)).toEqual(['tiles']);
    expect(pickedButOff(['cartoons', 'tiles'], () => true)).toEqual([]);
    expect(pickedButOff(['cartoons', 'sprites'], () => false)).toEqual([]);
    expect(pickedButOff([], () => false)).toEqual([]);
  });

  it('only names real interests and real features', () => {
    for (const k of Object.keys(INTEREST_FEATURE)) expect(INTERESTS.some((x) => x.id === k)).toBe(true);
  });
});

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const click = async (el: Element) => act(async () => void (el as HTMLElement).click());
const note = () => document.querySelector('.ob-off-note');
const next = async (n: number) => {
  for (let i = 0; i < n; i++) await click(document.querySelector('.ob-next')!);
};
const tilesCard = () => [...document.querySelectorAll<HTMLElement>('.ob-card')].find((c) => c.textContent?.includes('Tiles and levels'));

beforeEach(async () => {
  localStorage.clear();
  resetPrefs();
  _resetFeaturesForTests();
  registerFeatures([tilesFeature]);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => openOnboarding());
  await act(async () => root.render(<OnboardingSheet />));
  await next(1);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  act(() => closeOnboarding());
  vi.restoreAllMocks();
  resetPrefs();
});

describe('Tiles picked, then Tiles turned off', () => {
  it('says nothing while Tiles is on', async () => {
    await click(tilesCard()!);
    expect(note()).toBeNull();
    await next(3);
    expect(note()).toBeNull();
  });

  it('explains it on the picking step and the last one, in plain words', async () => {
    await click(tilesCard()!);
    act(() => void setFeatureOn('tiles', false, { remember: false }));
    expect(tilesCard()).toBeUndefined();
    expect(note()?.textContent).toContain('You picked Tiles and levels, but Tiles is turned off');
    expect(note()?.textContent).not.toContain('—');
    await next(3);
    expect(document.querySelector('.ob-done')).toBeTruthy();
    expect(note()?.textContent).toContain('Turn Tiles on');
  });

  it('turns Tiles on when they say yes, and the note goes', async () => {
    await click(tilesCard()!);
    act(() => void setFeatureOn('tiles', false, { remember: false }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await click(note()!.querySelector('button')!);
    expect(confirm.mock.calls[0][0]).toContain('Tiles and levels needs the Tiles feature, which is turned off. Turn Tiles on?');
    expect(isFeatureOn('tiles')).toBe(true);
    expect(note()).toBeNull();
    expect(tilesCard()).toBeTruthy();
  });

  it('leaves Tiles off and keeps the note when they say not now', async () => {
    await click(tilesCard()!);
    act(() => void setFeatureOn('tiles', false, { remember: false }));
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await click(note()!.querySelector('button')!);
    expect(isFeatureOn('tiles')).toBe(false);
    expect(note()).not.toBeNull();
  });

  it('shows no note for someone who never picked Tiles', async () => {
    act(() => void setFeatureOn('tiles', false, { remember: false }));
    expect(note()).toBeNull();
  });
});
