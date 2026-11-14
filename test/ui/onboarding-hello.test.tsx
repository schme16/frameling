// @vitest-environment jsdom
// The first-run hello is five steps. Page one is a plain list (nothing on it looks clickable but isn't), the settings
// page holds only what can be judged before a mark has been made, and the name is asked on the last page.
import fs from 'node:fs';
import path from 'node:path';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reduceFlow, startFlow, STEPS } from '../../src/ui/onboarding/flow';
import { FIT_LEVELS, OnboardingSheet } from '../../src/ui/onboarding/Onboarding';
import { closeOnboarding, openOnboarding } from '../../src/ui/overlays';
import { resetPrefs } from '../../src/ui/prefs';
import '../../src/renderer/features';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const click = async (el: Element) => act(async () => void (el as HTMLElement).click());
const next = async () => click(document.querySelector('.ob-next')!);
const title = () => document.querySelector('.ob-title')?.textContent;

beforeEach(async () => {
  localStorage.clear();
  resetPrefs();
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
  resetPrefs();
});

describe('the hello is short', () => {
  it('has five steps, and no separate step for the name', () => {
    expect(STEPS).toEqual(['hello', 'make', 'themes', 'prefs', 'done']);
    let s = startFlow();
    for (let i = 0; i < STEPS.length - 1; i++) s = reduceFlow(s, { type: 'next' });
    expect(s.step).toBe('done');
    expect(document.querySelectorAll('.ob-dots i')).toHaveLength(5);
  });

  it('page one lists what you can do without drawing anything that looks like a button', () => {
    expect(title()).toBe('Hello from Quill');
    const list = document.querySelector('.ob-hello')!;
    expect(list.tagName).toBe('UL');
    expect(list.querySelectorAll('li')).toHaveLength(5);
    expect(list.querySelector('button, a, [role="button"], [tabindex]')).toBeNull();
    expect(document.querySelector('.ob-feature')).toBeNull();
    expect(list.textContent).toContain('Tween');
  });

  it('asks only for look, sounds and Show Quill on the settings page', async () => {
    await next();
    await next();
    await next();
    expect(title()).toBe('A few handy settings');
    const labels = [...document.querySelectorAll('.ob-setting strong')].map((e) => e.textContent);
    expect(labels).toEqual(['Look', 'Sounds', 'Show Quill']);
    // The rest is a line pointing at Preferences, not rows to answer.
    expect(document.querySelectorAll('.ob-setting')).toHaveLength(3);
    expect(document.querySelector('.ob-more')!.textContent).toContain('Preferences');
  });

  it('asks for the name on the last page, with the dice, and keeps what is typed', async () => {
    for (let i = 0; i < 4; i++) await next();
    expect(title()).toBe('All set!');
    const input = document.querySelector<HTMLInputElement>('#ob-name-input')!;
    expect(input).toBeTruthy();
    expect(input.value.length).toBeGreaterThan(0);
    expect(document.querySelector('.ob-dice')).toBeTruthy();
    // Quill's name lines come first, then the "how shall we start" ones.
    const bubbles = [...document.querySelectorAll('.ob-bubble')].map((b) => b.textContent);
    expect(bubbles[0]).toMatch(/masterpiece/);
    expect(bubbles.length).toBe(4);
  });

  it('shrinks Quill and tightens the bubbles to fit, in steps, and never scrolls the bubbles', () => {
    const sizes = FIT_LEVELS.map((l) => l.q);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(sizes[0]).toBe(192);
    // The last resort is no picture of him, so his words still fit.
    expect(sizes[sizes.length - 1]).toBe(0);
    const css = fs.readFileSync(path.join(__dirname, '../../src/ui/onboarding/onboarding.css'), 'utf8');
    const block = (sel: string) => css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)));
    expect(block('.ob-bubbles')).not.toMatch(/overflow/);
    expect(block('.ob-quill')).toMatch(/overflow: hidden/);
  });

  it('lets the words of every card wrap, so a sentence never runs out of its card', async () => {
    await next();
    const cards = [...document.querySelectorAll('.ob-card')];
    expect(cards.length).toBeGreaterThan(3);
    for (const c of cards) expect(c.hasAttribute('data-wraps')).toBe(true);
    await next();
    await next();
    await next();
    for (const c of document.querySelectorAll('.ob-go')) expect(c.hasAttribute('data-wraps')).toBe(true);
  });

  it('shows one mode of themes at a time, so the colours page fits without scrolling', async () => {
    await next();
    await next();
    const modes = (document.querySelectorAll('.ob-themes .ob-theme').length);
    expect(modes).toBeGreaterThan(5);
    expect(document.querySelectorAll('.ob-themes')).toHaveLength(1);
    // Auto shows which mode to pick for; Dark or Light has no need to.
    const seg = (label: string) => [...document.querySelectorAll<HTMLElement>('.ob-mode .ui-seg')].find((b) => b.textContent?.includes(label))!;
    await click(seg('Auto'));
    expect(document.querySelector('.ob-looking')).toBeTruthy();
    await click(seg('Dark'));
    expect(document.querySelector('.ob-looking')).toBeNull();
    for (const t of document.querySelectorAll('.ob-theme')) expect(t.hasAttribute('data-wraps')).toBe(true);
  });
});
