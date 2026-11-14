// @vitest-environment jsdom
// The hello's answer to "What would you like to make?" puts away the optional areas none of the picks need, once, with
// one plain way back (Preferences > Features). The choosing is pure (flow.ts); the last page and the toast are drawn here.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isFeatureOn, setFeatureOn, switchableFeatures } from '../../src/features/host';
import { FeaturesPage } from '../../src/features/FeaturesPage';
import { featuresToTuck, INTEREST_KEEPS, nameList, reduceFlow, startFlow, TUCKABLE, type Interest, type TuckFeature } from '../../src/ui/onboarding/flow';
import { OnboardingSheet } from '../../src/ui/onboarding/Onboarding';
import { closeOnboarding, openOnboarding } from '../../src/ui/overlays';
import { resetPrefs } from '../../src/ui/prefs';
import { clearToasts, toasts } from '../../src/ui/toast';
import { getCommand } from '../../src/core/registry';
import { store } from '../../src/core/store';
import '../../src/ui/commands';
import '../../src/renderer/features';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const all = (over: Record<string, Partial<TuckFeature>> = {}): TuckFeature[] =>
  [
    { id: 'audio', on: true },
    { id: 'camera', on: true },
    { id: 'flow', on: true },
    { id: 'godot-export', on: true },
    { id: 'lipsync', on: true, requires: ['audio'] },
    { id: 'particles', on: true },
    { id: 'rig', on: true },
    { id: 'text', on: true },
    { id: 'tiles', on: true },
    { id: 'quill-pet', on: true },
  ].map((f) => ({ ...f, ...over[f.id] }));

describe('featuresToTuck', () => {
  it('puts nothing away for no picks, or for Just playing', () => {
    expect(featuresToTuck([], all())).toEqual([]);
    expect(featuresToTuck(['play'], all())).toEqual([]);
    // Play with anything else is still "no plan": keep everything.
    expect(featuresToTuck(['cartoons', 'play'], all())).toEqual([]);
  });

  it('puts away what the picks do not need and keeps what they do', () => {
    const cartoons = featuresToTuck(['cartoons'], all());
    expect(cartoons.sort()).toEqual(['camera', 'flow', 'godot-export', 'lipsync', 'particles', 'rig', 'tiles']);
    const sprites = featuresToTuck(['sprites'], all());
    expect(sprites).toEqual(expect.arrayContaining(['rig', 'lipsync', 'camera', 'text', 'tiles']));
    expect(sprites).not.toContain('flow');
    expect(sprites).not.toContain('godot-export');
    expect(sprites).not.toContain('particles');
  });

  it('keeps the union of every pick', () => {
    const both = featuresToTuck(['cartoons', 'motion'], all());
    expect(both).not.toContain('text');
    expect(both).not.toContain('camera');
    expect(both).not.toContain('particles');
    expect(both).toContain('rig');
  });

  it('never touches an area that is not in the table, or one that is already off', () => {
    expect(featuresToTuck(['cartoons'], all())).not.toContain('quill-pet');
    expect(featuresToTuck(['cartoons'], all({ rig: { on: false } }))).not.toContain('rig');
  });

  it('keeps an area that a kept area needs, and puts a dependant away first', () => {
    // Lip sync needs Audio: if Lip sync were kept, Audio could not go. Here a kept area needs one that would go.
    const list: TuckFeature[] = [
      { id: 'particles', on: true, requires: ['camera'] },
      { id: 'camera', on: true },
      { id: 'rig', on: true },
    ];
    // Motion keeps particles, so camera stays on whatever the table says about it.
    expect(featuresToTuck(['sprites'], list)).toEqual(['rig']);
    // Both away: the one that needs the other goes first.
    const away = featuresToTuck(['cartoons'], [{ id: 'camera', on: true }, { id: 'lipsync', on: true, requires: ['camera'] }, { id: 'audio', on: true }]);
    expect(away.indexOf('lipsync')).toBeLessThan(away.indexOf('camera'));
  });

  it('only names real optional features, so a rename cannot leave a stale id behind', () => {
    const real = new Set(switchableFeatures().map((f) => f.id));
    for (const id of TUCKABLE) expect(real.has(id), id).toBe(true);
    for (const keeps of Object.values(INTEREST_KEEPS)) for (const id of keeps) expect(real.has(id), id).toBe(true);
  });

  it('reads a list the way a person would', () => {
    expect(nameList([])).toBe('');
    expect(nameList(['Rig'])).toBe('Rig');
    expect(nameList(['Rig', 'Lip sync'])).toBe('Rig and Lip sync');
    expect(nameList(['Rig', 'Lip sync', 'Clip flow'])).toBe('Rig, Lip sync and Clip flow');
  });

  it('is on by default and the person can turn it off', () => {
    expect(startFlow().tuck).toBe(true);
    expect(reduceFlow(startFlow(), { type: 'tuck', on: false }).tuck).toBe(false);
  });
});

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const click = async (el: Element) => act(async () => void (el as HTMLElement).click());
const next = async (n: number) => {
  for (let i = 0; i < n; i++) await click(document.querySelector('.ob-next')!);
};
const card = (title: string) => [...document.querySelectorAll<HTMLElement>('.ob-card')].find((c) => c.textContent?.includes(title));
const ALL_BACK = ['audio', 'camera', 'flow', 'godot-export', 'lipsync', 'particles', 'rig', 'text', 'tiles'];

beforeEach(async () => {
  localStorage.clear();
  resetPrefs();
  clearToasts();
  for (const id of ALL_BACK) setFeatureOn(id, true, { remember: false });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => openOnboarding());
  await act(async () => root.render(<OnboardingSheet />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  act(() => closeOnboarding());
  for (const id of ALL_BACK) setFeatureOn(id, true, { remember: false });
  resetPrefs();
});

const toLastPage = async (...picks: string[]) => {
  await next(1);
  for (const p of picks) await click(card(p)!);
  await next(3);
  expect(document.querySelector('.ob-done')).toBeTruthy();
};
const finishBlank = async () => click(document.querySelector<HTMLElement>('.ob-go-list .ob-go:last-child')!);

describe('the last page of the hello', () => {
  it('says what it would put away, and puts it away when you start', async () => {
    await toLastPage('Sketches and cartoons');
    const row = document.querySelector('.ob-tuck')!;
    expect(row.textContent).toContain('Tuck away what you');
    expect(row.textContent).toContain('Rig');
    expect(row.textContent).toContain('Preferences > Features');
    expect(row.textContent).not.toContain('—');
    await finishBlank();
    expect(isFeatureOn('rig')).toBe(false);
    expect(isFeatureOn('lipsync')).toBe(false);
    expect(isFeatureOn('flow')).toBe(false);
    // What cartoons keep is still there.
    expect(isFeatureOn('audio')).toBe(true);
    expect(isFeatureOn('text')).toBe(true);
  });

  it('says so in a toast with a button that brings it all back', async () => {
    await toLastPage('Sketches and cartoons');
    await finishBlank();
    const t = toasts.get().find((x) => x.message.includes('Tucked away'));
    expect(t?.message).toContain('Rig');
    expect(t?.message).toContain('Preferences > Features');
    expect(t?.action?.label).toBe('Bring them back');
    act(() => t!.action!.run());
    for (const id of ALL_BACK) expect(isFeatureOn(id), id).toBe(true);
  });

  it('leaves everything alone when the switch is off', async () => {
    await toLastPage('Sketches and cartoons');
    await click(document.querySelector('.ob-tuck [role="switch"]')!);
    await finishBlank();
    for (const id of ALL_BACK) expect(isFeatureOn(id), id).toBe(true);
    expect(toasts.get().some((x) => x.message.includes('Tucked away'))).toBe(false);
  });

  it('leaves everything alone for Just playing, and shows no switch', async () => {
    await toLastPage('Just playing');
    expect(document.querySelector('.ob-tuck')).toBeNull();
    await finishBlank();
    for (const id of ALL_BACK) expect(isFeatureOn(id), id).toBe(true);
  });

  it('leaves everything alone when it is skipped', async () => {
    await next(1);
    await click(card('Sketches and cartoons')!);
    await click(document.querySelector('.ob-skip')!);
    for (const id of ALL_BACK) expect(isFeatureOn(id), id).toBe(true);
  });
});

describe('Preferences > Features is the way back', () => {
  it('has one button that turns everything back on, only while something is off', async () => {
    const page = document.createElement('div');
    document.body.appendChild(page);
    const r = createRoot(page);
    await act(async () => r.render(<FeaturesPage />));
    expect(page.querySelector('[data-testid="features-all-on"]')).toBeNull();
    act(() => void setFeatureOn('rig', false, { remember: false }));
    act(() => void setFeatureOn('flow', false, { remember: false }));
    const b = page.querySelector<HTMLElement>('[data-testid="features-all-on"]')!;
    expect(b.textContent).toContain('Turn everything back on');
    await click(b);
    expect(isFeatureOn('rig')).toBe(true);
    expect(isFeatureOn('flow')).toBe(true);
    expect(page.querySelector('[data-testid="features-all-on"]')).toBeNull();
    act(() => r.unmount());
    page.remove();
  });
});

describe('the command that brings it all back', () => {
  it('is in the palette, off while nothing is off, and turns every area back on', () => {
    const c = getCommand('view.featuresAllOn')!;
    expect(c.label).toBe('Turn every feature back on');
    expect(c.enabled?.(store().get())).toBe(false);
    setFeatureOn('rig', false, { remember: false });
    setFeatureOn('camera', false, { remember: false });
    expect(c.enabled?.(store().get())).toBe(true);
    c.run();
    expect(isFeatureOn('rig')).toBe(true);
    expect(isFeatureOn('camera')).toBe(true);
  });
});

describe('the interests are still the ones in the table', () => {
  it('has a row for every interest', () => {
    const picks: Interest[] = ['cartoons', 'sprites', 'tiles', 'motion', 'interactives', 'play'];
    expect(Object.keys(INTEREST_KEEPS).sort()).toEqual([...picks].sort());
  });
});
