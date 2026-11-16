// @vitest-environment jsdom
// Our own harnesses drive the app with ?debug and break things on purpose, so their problems must never leave
// the machine as reports. One harness run sent five "Nothing exports as interactives" reports to the board on
// 2026-11-14, which is what this pins.
import { describe, expect, it, beforeEach, vi } from 'vitest';

const setSearch = (search: string) => {
  window.history.replaceState({}, '', `/${search}`);
};

describe('automatic reports under a harness', () => {
  beforeEach(() => {
    vi.resetModules();
    setSearch('');
  });

  it('stay off while the page has ?debug', async () => {
    setSearch('?debug');
    vi.doMock('../../src/beta/send', () => ({ canSend: () => true, sendReport: vi.fn() }));
    vi.doMock('../../src/ui/prefs', () => ({ getPrefs: () => ({ betaReports: true }) }));
    const { autoOn } = await import('../../src/beta/auto');
    expect(autoOn()).toBe(false);
  });

  it('still go in a normal beta build', async () => {
    vi.doMock('../../src/beta/send', () => ({ canSend: () => true, sendReport: vi.fn() }));
    vi.doMock('../../src/ui/prefs', () => ({ getPrefs: () => ({ betaReports: true }) }));
    const { autoOn } = await import('../../src/beta/auto');
    expect(autoOn()).toBe(true);
  });

  it('stay off with no key, harness or not', async () => {
    vi.doMock('../../src/beta/send', () => ({ canSend: () => false, sendReport: vi.fn() }));
    vi.doMock('../../src/ui/prefs', () => ({ getPrefs: () => ({ betaReports: true }) }));
    const { autoOn } = await import('../../src/beta/auto');
    expect(autoOn()).toBe(false);
  });
});
