// @vitest-environment jsdom
// The report panel in Preferences > Diagnostics: the saved contact detail (kept after a send, with a plain way to forget
// it), the rule that nothing goes before it has been shown, and the computer's details in the preview.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GpuReport } from '../../src/preload/api';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sent: unknown[] = [];
vi.mock('../../src/beta/send', () => ({
  BETA_PAGE: 'https://example.invalid/testing',
  canSend: () => true,
  checkBoard: async () => ({ ok: true }),
  lastSendFailure: () => null,
  sayFailure: () => 'It did not go.',
  sendReport: async (r: unknown) => (sent.push(r), { ok: true }),
}));
vi.mock('../../src/beta/problems', () => ({ recentProblems: () => [] }));
vi.mock('../../src/tablet/check/state', () => ({ gatherEnv: async () => ({ appVersion: '1.0.0', platform: 'linux' }) }));

const gpu: GpuReport = {
  platform: 'linux',
  arch: 'x64',
  electron: '45',
  chromium: '140',
  devices: [{ vendorId: 0x10de, deviceId: 1, active: true, name: 'NVIDIA GeForce RTX 4080 SUPER', driver: 'NVIDIA 580.65', discrete: true }],
  liveRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 SUPER, Vulkan 1.3)',
  glImplementation: '(gl=egl-angle,angle=vulkan)',
  features: { gpu_compositing: 'enabled', '2d_canvas': 'enabled', rasterization: 'enabled' },
  hardwareAcceleration: true,
  flags: ['--ignore-gpu-blocklist'],
  off: { file: false, env: false, path: '/home/ada/.config/Frameling/gpu-off' },
  gpuKb: 1,
  appKb: 2,
  cpu: { model: 'AMD Ryzen 7 5800X 8-Core Processor', cores: 8, threads: 16, arch: 'x64' },
  memoryBytes: 32 * 1024 ** 3,
};

let root: Root;
let host: HTMLDivElement;
let prefs: typeof import('../../src/ui/prefs');

async function mount() {
  const { BetaPanel } = await import('../../src/beta/BetaPanel');
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<BetaPanel />));
}
const q = <T extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as T | null;
const button = (label: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(label)) as HTMLButtonElement | undefined;
async function type(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const click = async (el: Element | undefined) => void (await act(async () => void (el as HTMLElement).click()));

beforeEach(async () => {
  localStorage.clear();
  sent.length = 0;
  vi.resetModules();
  (window as unknown as { frameling?: unknown }).frameling = { files: {}, gpu: { report: async () => gpu }, platform: 'linux', versions: { app: '1.0.0', electron: '45', chrome: '140' } };
  prefs = await import('../../src/ui/prefs');
  prefs.setPrefs({ betaReports: true, betaContact: '' });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  (window as unknown as { frameling?: unknown }).frameling = undefined;
});

describe('How can we reach you', () => {
  it('with nothing saved it is a box to type in, and what you type is saved as you go', async () => {
    await mount();
    expect(q('[data-testid="beta.contact"]')!.dataset.saved).toBe('false');
    await type(q<HTMLInputElement>('[data-testid="beta.contact"] input')!, 'ada@example.com');
    expect(prefs.getPrefs().betaContact).toBe('ada@example.com');
  });

  it('with something saved it shows as a saved detail, not a box that looks unfinished', async () => {
    prefs.setPrefs({ betaContact: 'ada@example.com' });
    await mount();
    expect(q('[data-testid="beta.contact"]')!.dataset.saved).toBe('true');
    expect(q('[data-testid="beta.contactValue"]')!.textContent).toBe('ada@example.com');
    expect(q('[data-testid="beta.contact"] input')).toBeNull();
    expect(host.textContent).toContain('Remembered on this computer');
  });

  it('Change opens it for typing again, and Forget it clears it with one press', async () => {
    prefs.setPrefs({ betaContact: 'ada@example.com' });
    await mount();
    await click(button('Change'));
    expect(q<HTMLInputElement>('[data-testid="beta.contact"] input')!.value).toBe('ada@example.com');
    await click(button('Forget it'));
    expect(prefs.getPrefs().betaContact).toBe('');
    expect(q('[data-testid="beta.contact"]')!.dataset.saved).toBe('false');
  });

  it('a saved detail has a Forget it right there', async () => {
    prefs.setPrefs({ betaContact: 'ada@example.com' });
    await mount();
    await click(button('Forget it'));
    expect(prefs.getPrefs().betaContact).toBe('');
  });
});

describe('nothing goes before it has been shown', () => {
  it('Send it stays off until the report has been shown, and goes off again when the words change', async () => {
    await mount();
    const note = q<HTMLTextAreaElement>('textarea')!;
    await type(note, 'The canvas went blank');
    expect(button('Send it')!.disabled).toBe(true);
    await click(button('Show me what you would send'));
    expect(button('Send it')!.disabled).toBe(false);
    await type(note, 'The canvas went blank again');
    expect(button('Send it')!.disabled).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it('what is sent is exactly the report that was shown', async () => {
    await mount();
    await type(q<HTMLTextAreaElement>('textarea')!, 'It froze');
    await click(button('Show me what you would send'));
    const shown = q('.bt-preview')!.textContent;
    await click(button('Send it'));
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(sent[0], null, 2)).toBe(shown);
  });
});

describe('the moment just after a send', () => {
  it('clears the note and says so, and the contact detail stays, shown as saved', async () => {
    prefs.setPrefs({ betaContact: 'ada@example.com' });
    await mount();
    await type(q<HTMLTextAreaElement>('textarea')!, 'It froze');
    await click(button('Show me what you would send'));
    await click(button('Send it'));
    expect(q<HTMLTextAreaElement>('textarea')!.value).toBe('');
    expect(prefs.getPrefs().betaContact).toBe('ada@example.com');
    const said = host.querySelector('[role="status"]')!;
    expect(said.textContent).toMatch(/Sent\./);
    expect(said.textContent).toMatch(/note is cleared/);
    expect(said.textContent).toMatch(/contact details are still saved/);
    expect(q('[data-testid="beta.contact"]')!.dataset.saved).toBe('true');
  });

  it('with no contact saved it does not talk about one', async () => {
    await mount();
    await type(q<HTMLTextAreaElement>('textarea')!, 'It froze');
    await click(button('Show me what you would send'));
    await click(button('Send it'));
    expect(host.querySelector('[role="status"]')!.textContent).not.toMatch(/contact/);
  });
});

describe('the details of this computer', () => {
  it('show plainly in the preview, above the exact text, and are in that text too', async () => {
    await mount();
    await type(q<HTMLTextAreaElement>('textarea')!, 'Blank canvas');
    await click(button('Show me what you would send'));
    const box = q('[data-testid="report.machine"]')!;
    expect(box.textContent).toContain('AMD Ryzen 7 5800X 8-Core Processor, 8 cores, 16 threads');
    expect(box.textContent).toContain('NVIDIA GeForce RTX 4080 SUPER');
    expect(box.textContent).toContain('Vulkan');
    expect(box.textContent).toContain('32 GB');
    expect(q('.bt-preview')!.textContent).toContain('AMD Ryzen 7 5800X 8-Core Processor');
    expect(q('.bt-preview')!.textContent).not.toContain('/home/ada');
  });

  it('are left out when the box is unticked, in the preview and in what is sent', async () => {
    await mount();
    await click(q('[data-testid="beta.machine"]')!);
    expect(prefs.getPrefs().betaMachine).toBe(false);
    await type(q<HTMLTextAreaElement>('textarea')!, 'Blank canvas');
    await click(button('Show me what you would send'));
    expect(q('[data-testid="report.machine"]')).toBeNull();
    expect(q('.bt-preview')!.textContent).not.toContain('Ryzen');
    await click(button('Send it'));
    expect(JSON.stringify(sent[0])).not.toContain('Ryzen');
  });

  it('changing the box throws the preview away, so what you read is never out of date', async () => {
    await mount();
    await type(q<HTMLTextAreaElement>('textarea')!, 'Blank canvas');
    await click(button('Show me what you would send'));
    await click(q('[data-testid="beta.machine"]')!);
    expect(q('.bt-preview')).toBeNull();
    expect(button('Send it')!.disabled).toBe(true);
  });
});
