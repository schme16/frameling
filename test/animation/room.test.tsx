// @vitest-environment jsdom
// The Animate room on a still picture, the Add animation card, the bar button, and the drawer, in the page.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isAnimated } from '../../src/core/animation';
import { setChoice } from '../../src/core/choices';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { applyWorkspace, resetDock } from '../../src/ui/dock';
import { DockZoneView } from '../../src/ui/DockView';
import { StatusBar } from '../../src/ui/StatusBar';
import { TimelinePanel } from '../../src/timeline/TimelinePanel';
import { loadApp } from '../findability/app';

vi.mock('../../src/ui/rightDock.css', () => ({}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};

let host: HTMLDivElement;
let root: Root;
beforeAll(async () => {
  await loadApp();
});
beforeEach(() => {
  setChoice('animation.openAnimate', undefined);
  resetDock();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const show = (el: React.ReactElement) => act(() => root.render(el));

describe('the Animate room on a still picture', () => {
  it('adds animation the first time, because picking the room is a plain wish, and says so', () => {
    const s = resetStore(newDoc({ animated: false }));
    expect(applyWorkspace('animate')).toBe(true);
    expect(isAnimated(s.get().doc)).toBe(true);
    expect(s.get().doc.length).toBe(24);
  });
  it('only offers the button when that is the remembered answer', () => {
    setChoice('animation.openAnimate', 'offer');
    const s = resetStore(newDoc({ animated: false }));
    applyWorkspace('animate');
    expect(isAnimated(s.get().doc)).toBe(false);
  });
  it('leaves an animation alone, and so does going to Draw', () => {
    const s = resetStore(newDoc({ animated: true, length: 9 }));
    applyWorkspace('animate');
    expect(s.get().doc.length).toBe(9);
    resetStore(newDoc({ animated: false }));
    applyWorkspace('draw');
    expect(isAnimated(store().get().doc)).toBe(false);
  });
});

describe('the Add animation card', () => {
  it('stands where the timeline would, on a still, and one press adds animation', () => {
    const s = resetStore(newDoc({ animated: false }));
    show(<TimelinePanel />);
    expect(host.querySelector('[data-testid="animation.card"]')).toBeTruthy();
    expect(host.textContent).toMatch(/still picture/);
    expect(host.querySelector('.tl-root')).toBeNull();
    act(() => (host.querySelector('[data-testid="animation.add"]') as HTMLButtonElement).click());
    expect(isAnimated(s.get().doc)).toBe(true);
    expect(host.querySelector('[data-testid="animation.card"]')).toBeNull();
    expect(host.querySelector('.tl-root')).toBeTruthy();
  });
  it('an animation gets the timeline', () => {
    resetStore(newDoc({ animated: true }));
    show(<TimelinePanel />);
    expect(host.querySelector('.tl-root')).toBeTruthy();
    expect(host.querySelector('[data-testid="animation.card"]')).toBeNull();
  });
});

describe('the bar at the bottom', () => {
  it('says Add animation on a still, with no frame rate or frame counter', () => {
    resetStore(newDoc({ animated: false }));
    show(<StatusBar />);
    expect(host.querySelector('[data-testid="status.addAnimation"]')).toBeTruthy();
    expect(host.textContent).not.toMatch(/fps/);
    expect(host.textContent).not.toMatch(/Frame \d+ of/);
  });
  it('shows the frame rate and the frame counter once there is animation, and no button', () => {
    resetStore(newDoc({ animated: true, length: 12, fps: 10 }));
    show(<StatusBar />);
    expect(host.textContent).toMatch(/10 fps/);
    expect(host.textContent).toMatch(/Frame 1 of 12/);
    expect(host.querySelector('[data-testid="status.addAnimation"]')).toBeNull();
  });
  it('the button adds animation, and the bar changes to match', () => {
    const s = resetStore(newDoc({ animated: false }));
    show(<StatusBar />);
    act(() => (host.querySelector('[data-testid="status.addAnimation"]') as HTMLButtonElement).click());
    expect(isAnimated(s.get().doc)).toBe(true);
    expect(host.textContent).toMatch(/Frame 1 of 24/);
  });
});

describe('the drawer across the bottom', () => {
  it('is not there on a still in the Draw room, and is there with animation', () => {
    resetStore(newDoc({ animated: false }));
    applyWorkspace('draw');
    show(<DockZoneView zone="bottom" />);
    expect(host.querySelector('.ui-zone-bottom')).toBeNull();
    act(() => void store().update('Add animation', (d) => void (d.animated = true)));
    expect(host.querySelector('.ui-zone-bottom')).toBeTruthy();
  });
  it('the Animate room keeps its place, with the card in it, so the way in is where the timeline goes', () => {
    setChoice('animation.openAnimate', 'offer');
    resetStore(newDoc({ animated: false }));
    applyWorkspace('animate');
    show(<DockZoneView zone="bottom" />);
    expect(host.querySelector('.ui-zone-bottom')).toBeTruthy();
  });
});
