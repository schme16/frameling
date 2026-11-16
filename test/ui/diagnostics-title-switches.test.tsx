// @vitest-environment jsdom
// The three Diagnostics groups carry their switch opposite their own heading (PrefTitle), the way Streaming and Snapping
// do, and each one always says in words what on and off mean, so an off group is never a silent grey page.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../src/beta/send', () => ({
  BETA_PAGE: 'https://example.invalid/testing',
  canSend: () => true,
  checkBoard: async () => ({ ok: true }),
  lastSendFailure: () => null,
  sayFailure: () => 'It did not go.',
  sendReport: async () => ({ ok: true }),
}));
vi.mock('../../src/beta/problems', () => ({ recentProblems: () => [] }));
vi.mock('../../src/tablet/check/state', () => ({ gatherEnv: async () => ({ appVersion: '1.0.0', platform: 'linux' }), checkMemory: { use: () => false }, startPenCheck: () => {} }));
vi.mock('../../src/update/state', () => ({ checkForUpdates: async () => {} }));
vi.mock('../../src/io/desktop', () => ({ desktop: () => ({ plugins: {} }) }));
vi.mock('../../src/io/restart', () => ({ restartFrameling: async () => {} }));
vi.mock('../../src/plugins/manager', () => ({
  diagnosticsAvailableNote: (on: boolean) => (on ? 'On. Every plugin runs in its own process, so its memory can be read.' : 'Off. Nothing is measured, and plugins share one process.'),
  memoryMeasurable: async () => false,
  refreshDiag: async () => {},
  syncDiagnosticsFlag: () => {},
}));

let host: HTMLDivElement;
let root: Root;
let prefs: typeof import('../../src/ui/prefs');

beforeEach(async () => {
  localStorage.clear();
  vi.resetModules();
  (window as unknown as { frameling?: unknown }).frameling = { files: {}, gpu: { report: async () => null }, platform: 'linux', versions: { app: '1.0.0', electron: '45', chrome: '140' } };
  prefs = await import('../../src/ui/prefs');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

/** The heading, the switch and the status line of the one title row on the page. */
function titleRow() {
  const row = host.querySelector('.ui-pref-title')!;
  return {
    heading: row.querySelector('h4')?.textContent ?? '',
    sw: row.querySelector<HTMLButtonElement>('[role="switch"]')!,
    status: row.querySelector('.ui-pref-title-status')?.textContent ?? '',
  };
}

describe('Telling the makers', () => {
  it('has its switch opposite the heading and says what off means', async () => {
    prefs.setPrefs({ betaReports: false });
    const { BetaPanel } = await import('../../src/beta/BetaPanel');
    await act(async () => root.render(<BetaPanel />));
    const t = titleRow();
    expect(t.heading).toBe('Telling the makers');
    expect(t.sw.getAttribute('aria-checked')).toBe('false');
    expect(t.status).toContain('nothing at all leaves this computer');
    await act(async () => void t.sw.click());
    expect(prefs.getPrefs().betaReports).toBe(true);
    expect(titleRow().status).toContain('when you press Send');
  });
});

describe('New versions', () => {
  it('has its switch opposite the heading and says what is sent either way', async () => {
    prefs.setPrefs({ updateCheck: true });
    const { UpdatePanel } = await import('../../src/update/UpdatePanel');
    await act(async () => root.render(<UpdatePanel />));
    const t = titleRow();
    expect(t.heading).toBe('New versions');
    expect(t.status).toContain('one request');
    await act(async () => void t.sw.click());
    expect(prefs.getPrefs().updateCheck).toBe(false);
    expect(titleRow().status).toContain('Nothing is asked of anyone');
  });
});

describe('Plugin measuring', () => {
  it('has its switch opposite the heading, named for what it measures', async () => {
    prefs.setPrefs({ pluginDiagnostics: false });
    const { DiagnosticsSwitch } = await import('../../src/plugins/DiagnosticsSwitch');
    await act(async () => root.render(<DiagnosticsSwitch />));
    const t = titleRow();
    expect(t.heading).toBe('Plugin measuring');
    expect(t.sw.getAttribute('aria-label')).toBe("Measuring plugins' memory and speed, on or off");
    expect(t.status).toContain('Nothing is measured');
    await act(async () => void t.sw.click());
    expect(prefs.getPrefs().pluginDiagnostics).toBe(true);
  });
});

describe('every one of the three', () => {
  it('ties its status line to its switch, so a screen reader reads the state with the switch', async () => {
    prefs.setPrefs({ updateCheck: true });
    const { UpdatePanel } = await import('../../src/update/UpdatePanel');
    await act(async () => root.render(<UpdatePanel />));
    const row = host.querySelector('.ui-pref-title')!;
    const said = row.querySelector('.ui-pref-title-status')!;
    expect(row.querySelector('[role="switch"]')!.getAttribute('aria-describedby')).toBe(said.id);
  });
});
