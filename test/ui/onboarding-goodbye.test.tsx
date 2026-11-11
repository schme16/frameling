// @vitest-environment jsdom
// The settings step of the first-run hello: switching Show Quill off gets a sad goodbye before he hides, on gets a cheer.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setQuillSheet } from '../../src/ui/mascot/runtime';
import { GOODBYE_WORDS, SAD_HOLD, WELCOME_BACK_WORDS } from '../../src/ui/mascot/scripts';
import { totalMs } from '../../src/ui/mascot/timing';
import { OnboardingSheet } from '../../src/ui/onboarding/Onboarding';
import { closeOnboarding, openOnboarding } from '../../src/ui/overlays';
import { getPrefs, resetPrefs } from '../../src/ui/prefs';
import { FAKE_SHEET as S } from '../fixtures/quill-sheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'queueMicrotask', 'Date'] });
  resetPrefs();
  setQuillSheet({ ...S, url: 'quill.png', width: 128, height: 352 });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  act(() => closeOnboarding());
  vi.useRealTimers();
  resetPrefs();
});

const click = async (el: Element) => act(async () => void (el as HTMLElement).click());
const quillEl = () => document.querySelector<HTMLElement>('.ob-quill-stand .quill');
const bubbles = () => [...document.querySelectorAll('.ob-bubble')].map((b) => b.textContent);
const showQuillSwitch = () => document.querySelector('[role="switch"][aria-label="Show Quill"]')!;
const wait = async (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

async function toSettings() {
  act(() => openOnboarding());
  await act(async () => root.render(<OnboardingSheet />));
  for (let i = 0; i < 3; i++) await click(document.querySelector('.ob-next')!);
  expect(document.querySelector('.ob-settings')).toBeTruthy();
}

describe('Show Quill on the settings step', () => {
  it('off: sad with kind words, a goodbye wave, then he hides', async () => {
    await toSettings();
    await click(showQuillSwitch());
    expect(getPrefs().showQuill).toBe(false);
    expect(bubbles()).toEqual(GOODBYE_WORDS.long);
    expect(quillEl()?.dataset.anim).toBe('sad');
    await wait(SAD_HOLD.long + 50);
    expect(quillEl()?.dataset.anim).toBe('wave-sad');
    await wait(totalMs(S.anims['wave-sad']) + 100);
    expect(quillEl()).toBeNull();
    expect(document.querySelector('.ob-quill')!.classList.contains('is-alone')).toBe(true);
    // His words stay put after he's gone.
    expect(bubbles()).toEqual(GOODBYE_WORDS.long);
  });

  it('on again in the same step: a happy cheer', async () => {
    await toSettings();
    await click(showQuillSwitch());
    await wait(SAD_HOLD.long + totalMs(S.anims['wave-sad']) + 200);
    await click(showQuillSwitch());
    expect(getPrefs().showQuill).toBe(true);
    expect(quillEl()?.dataset.anim).toBe('cheer');
    expect(bubbles()).toEqual([WELCOME_BACK_WORDS]);
  });

  it('on again halfway through the goodbye: straight to the cheer', async () => {
    await toSettings();
    await click(showQuillSwitch());
    await wait(500);
    await click(showQuillSwitch());
    expect(quillEl()?.dataset.anim).toBe('cheer');
  });
});
