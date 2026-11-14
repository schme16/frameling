// @vitest-environment jsdom
// Clicking a clip shows how it plays in Properties (Clip), in plain words: no hunting for a right-click on a small chip.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetStore } from '../../src/core/store';
import '../../src/timeline';
import { CLIP_DIRECTIONS, DIRECTION_WORDS } from '../../src/core/clipPlay';
import { ClipPanel } from '../../src/timeline/ClipPanel';
import { DIRECTION_HELP } from '../../src/timeline/ClipPlay';
import { setTl } from '../../src/timeline/state';
import { sectionsNow } from '../../src/ui/panelInfo';
import { registerPanel, unregisterPanel } from '../../src/core/registry';
import { dock, isVisible, resetDock } from '../../src/ui/dock';
import { docWith } from './helpers';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  setTl({ clipId: null });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const withClip = () => {
  const s = resetStore(docWith([[0, 6]], 12));
  act(() => s.update('Clip', (d) => void d.clips.push({ id: 'k1', name: 'Bounce', start: 1, end: 4, loop: false })));
  return s;
};

describe('the Clip section of Properties', () => {
  it('shows while a clip is picked, first in the list, and waits under Also here otherwise', () => {
    const s = withClip();
    const all = ['tool-options', 'clip-play', 'colors'];
    expect(sectionsNow(all, s.get(), null)).toEqual({ shown: ['tool-options', 'colors'], idle: ['clip-play'] });
    act(() => setTl({ clipId: 'k1' }));
    expect(sectionsNow(all, s.get(), null).shown).toEqual(['clip-play', 'tool-options', 'colors']);
  });

  it('says how to pick a clip when none is picked', () => {
    withClip();
    act(() => root.render(<ClipPanel />));
    expect(host.textContent).toContain('Click a clip on the timeline');
  });

  it('shows the picked clip: its name, frames and the way it plays, and changes it', () => {
    const s = withClip();
    act(() => setTl({ clipId: 'k1' }));
    act(() => root.render(<ClipPanel />));
    expect(host.textContent).toContain('Bounce');
    expect(host.textContent).toContain('frames 2 to 5');
    const plays = host.querySelector<HTMLSelectElement>('select[aria-label="Which way the clip plays"]')!;
    expect([...plays.options].map((o) => o.textContent)).toEqual(CLIP_DIRECTIONS.map((d) => DIRECTION_HELP[d]));
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!;
      set.call(plays, 'pingpong');
      plays.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(s.get().doc.clips[0].direction).toBe('pingpong');
    expect(host.textContent).toContain('back and forth');
  });
});

describe('plain words for the directions', () => {
  it('never say ping-pong or from the end', () => {
    for (const d of CLIP_DIRECTIONS) {
      for (const w of [DIRECTION_WORDS[d], DIRECTION_HELP[d]]) expect(w, w).not.toMatch(/ping|from the end/i);
    }
    expect(DIRECTION_HELP.pingpong).toBe('Back and forth');
    expect(DIRECTION_HELP['pingpong-reverse']).toBe('Back and forth, backward first');
  });
});

describe('a way to Clip flow, which starts put away', () => {
  const flow = () => registerPanel({ id: 'clip-flow', title: 'Clip flow', icon: 'flow', component: () => null, zone: 'right', startsAway: true });
  const button = () => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Open Clip flow');
  it('is in the Clip section with a clip picked, and opens the panel from away', () => {
    flow();
    resetDock();
    withClip();
    act(() => setTl({ clipId: 'k1' }));
    act(() => root.render(<ClipPanel />));
    expect(isVisible('clip-flow')).toBe(false);
    act(() => button()!.click());
    expect(isVisible('clip-flow')).toBe(true);
    expect(dock.get().layout.hidden).not.toContain('clip-flow');
    unregisterPanel('clip-flow');
  });
  it('is there with no clip picked too, and absent when the Clip flow feature is off', () => {
    withClip();
    act(() => root.render(<ClipPanel />));
    expect(button()).toBeUndefined();
    flow();
    act(() => root.render(<ClipPanel />));
    expect(button()).toBeTruthy();
    unregisterPanel('clip-flow');
  });
});

