// @vitest-environment jsdom
// The Performance page as a person meets it: the plain answer first, the restart said before and after, the way back from
// outside the app on show, and the search finding the page by other apps' names.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/renderer/features';
import { pretendReport } from '../../src/gpu/report';
import { DEFAULT_PERF, getPerf, resetPerf } from '../../src/gpu/settings';
import { searchPrefs } from '../../src/ui/prefsSearch';
import { allPrefRows } from '../../src/ui/prefsIndex';
import { closePrefs, openPrefs } from '../../src/ui/overlays';
import { PrefsModal } from '../../src/ui/PrefsModal';
import type { GpuReport } from '../../src/preload/api';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const card: GpuReport = {
  platform: 'linux', arch: 'x64', electron: '45', chromium: '140',
  devices: [{ vendorId: 0x10de, deviceId: 1, active: true, name: 'NVIDIA GeForce RTX 4080 SUPER', driver: 'NVIDIA 580.65' }],
  glImplementation: '(gl=egl-angle,angle=vulkan)', features: { gpu_compositing: 'enabled', '2d_canvas': 'enabled', vulkan: 'enabled_on' },
  hardwareAcceleration: true, flags: [], off: { file: false, env: false, path: '/home/a/.config/Frameling/gpu-off' }, gpuKb: 300000, appKb: 800000,
};

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  act(() => closePrefs());
  act(() => root.unmount());
  await act(async () => pretendReport(null));
  resetPerf();
  host.remove();
  document.body.innerHTML = '';
});

const open = async (r: GpuReport | null) => {
  await act(async () => pretendReport(r));
  act(() => root.render(<PrefsModal />));
  await act(async () => openPrefs('performance'));
};
const text = () => host.querySelector('.gp-page')?.textContent ?? '';

describe('the Performance page', () => {
  it('says the card is doing the drawing, and names it', async () => {
    await open(card);
    expect(text()).toContain('Your card is doing the drawing.');
    expect(text()).toContain('NVIDIA GeForce RTX 4080 SUPER');
    expect(text()).toContain('Vulkan');
  });
  it('says software is slower and what to try', async () => {
    await open({ ...card, devices: [{ vendorId: 0x1002, deviceId: 2, active: true }], glImplementation: '(gl=none,angle=none)', features: { gpu_compositing: 'disabled_software', '2d_canvas': 'disabled_software' } });
    expect(text()).toContain('drawing in software, which is slower');
    expect(text()).toContain('driver');
  });
  it('says before anything is pressed that hardware drawing needs a restart, and shows the way back from outside', async () => {
    await open(card);
    expect(host.querySelector('.gp-restart')?.textContent).toBe('Needs a restart');
    expect(text()).toContain('gpu-off');
    expect(text()).toContain('FRAMELING_GPU=off');
    expect(text()).toContain('/home/a/.config/Frameling');
  });
  it('offers Restart now once the choice differs from what is running', async () => {
    await open({ ...card, off: { ...card.off, file: true } });
    expect(text()).toContain('Restart Frameling to use it');
    expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'Restart now')).toBe(true);
  });
  it('copies the report for a bug report', async () => {
    await open(card);
    const write = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    const b = [...host.querySelectorAll('button')].find((x) => x.textContent === 'Copy for a bug report')!;
    await act(async () => void b.click());
    expect(write).toHaveBeenCalledTimes(1);
    expect((write.mock.calls[0] as unknown as string[])[0]).toContain('Card in use: NVIDIA GeForce RTX 4080 SUPER');
  });
  it('changes the settings and puts them back', async () => {
    await open(card);
    const radio = (name: string, label: string) => [...host.querySelectorAll(`[aria-label="${name}"] button`)].find((b) => b.textContent === label) as HTMLElement;
    act(() => radio('Drawings kept ready', 'Large').click());
    act(() => radio('Scrubbing the timeline', 'Quick').click());
    act(() => radio('Playback frame rate limit', '12').click());
    expect(getPerf()).toEqual({ cacheMb: 320, scrub: 'quick', fpsCap: 12 });
    const back = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Put these back to how they were') as HTMLButtonElement;
    await act(async () => void back.click());
    expect(getPerf()).toEqual(DEFAULT_PERF);
  });
  it('points at the undo steps in General instead of repeating them', async () => {
    await open(card);
    expect(text()).toContain('Undo steps live in General');
    act(() => [...host.querySelectorAll<HTMLElement>('.gp-link')][0].click());
    expect(host.querySelector('.ui-prefs-tab.is-chosen')?.textContent).toBe('General');
  });
  it('in the web version leaves the card and the hardware switch out', async () => {
    await open(null);
    expect(text()).toContain('web version');
    expect(text()).not.toContain('Hardware drawing');
    expect(text()).toContain('Drawings kept ready');
  });
});

describe('searching for it', () => {
  const rows = () => allPrefRows();
  const where = (q: string) => searchPrefs(q, rows()).slice(0, 5).map((h) => `${h.row.page}/${h.row.label}`);
  it('finds the page by other apps\' names', () => {
    expect(where('hardware acceleration')[0]).toBe('performance/Hardware drawing');
    expect(where('gpu acceleration')[0]).toBe('performance/Hardware drawing');
    expect(where('renderer').some((x) => x.startsWith('performance/'))).toBe(true);
    expect(where('vram').some((x) => x.startsWith('performance/'))).toBe(true);
    expect(where('cache')[0]).toBe('performance/Drawings kept ready');
    expect(where('fps cap')[0]).toBe('performance/Playback frame rate limit');
    expect(where('draft mode')[0]).toBe('performance/Scrubbing the timeline');
    expect(where('performance').every((x) => x.startsWith('performance/'))).toBe(true);
  });
});

