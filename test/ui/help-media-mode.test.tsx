// @vitest-environment jsdom
// The help picture matches the mode the app is in, and follows it: the Dark / Light switch, and Auto when the computer
// goes dark or light.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HelpMedia } from '../../src/ui/help/media';
import { resetPrefs, setPrefs } from '../../src/ui/prefs';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A matchMedia that can flip, like the computer's own light/dark setting.
let computerDark = true;
const listeners = new Set<() => void>();
const fakeMatchMedia = (q: string) => ({
  matches: q.includes('prefers-color-scheme: dark') ? computerDark : q.includes('prefers-color-scheme: light') ? !computerDark : false,
  addEventListener: (_: string, f: () => void) => listeners.add(f),
  removeEventListener: (_: string, f: () => void) => listeners.delete(f),
});

let host: HTMLElement;
let root: Root;
beforeEach(() => {
  computerDark = true;
  listeners.clear();
  (window as unknown as { matchMedia: unknown }).matchMedia = fakeMatchMedia;
  // jsdom has no media playback.
  HTMLMediaElement.prototype.play = () => Promise.resolve();
  HTMLMediaElement.prototype.pause = () => undefined;
  resetPrefs();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const src = () => host.querySelector('img')!.getAttribute('src');
const videoSrc = () => host.querySelector('video')!.getAttribute('src');
const poster = () => host.querySelector('video')!.getAttribute('poster');

describe('help media follows the mode', () => {
  it('shows the dark picture in dark mode and the light one in light mode', () => {
    setPrefs({ theme: 'dark' });
    act(() => root.render(<HelpMedia media="select.png" title="Select" />));
    expect(src()).toBe('help/select-dark.png');
    act(() => setPrefs({ theme: 'light' }));
    expect(src()).toBe('help/select-light.png');
  });

  it('gives a clip and its poster for the mode', () => {
    setPrefs({ theme: 'light' });
    act(() => root.render(<HelpMedia media="tour.mp4" title="Tour" />));
    expect(videoSrc()).toBe('help/tour-light.mp4');
    expect(poster()).toBe('help/tour-light-poster.png');
    act(() => setPrefs({ theme: 'dark' }));
    expect(videoSrc()).toBe('help/tour-dark.mp4');
    expect(poster()).toBe('help/tour-dark-poster.png');
  });

  it('with Auto follows the computer, live', () => {
    setPrefs({ theme: 'system' });
    act(() => root.render(<HelpMedia media="select.png" title="Select" />));
    expect(src()).toBe('help/select-dark.png');
    computerDark = false;
    act(() => listeners.forEach((f) => f()));
    expect(src()).toBe('help/select-light.png');
    computerDark = true;
    act(() => listeners.forEach((f) => f()));
    expect(src()).toBe('help/select-dark.png');
  });
});
