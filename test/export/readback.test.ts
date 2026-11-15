import { afterEach, describe, expect, it, vi } from 'vitest';

// The export canvases' willReadFrequently flag: on unless the desktop side was started with FRAMELING_EXPORT_READBACK=0.
describe('export read-back flag', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('is on when nothing says otherwise', async () => {
    vi.resetModules();
    const m = await import('../../src/export/readback');
    expect(m.READBACK_FLAG).toBe(true);
    expect(m.exportContextOptions).toEqual({ willReadFrequently: true });
  });

  it('is off when the desktop side says so', async () => {
    vi.stubGlobal('window', { frameling: { tuning: { exportReadback: false } } });
    vi.resetModules();
    const m = await import('../../src/export/readback');
    expect(m.READBACK_FLAG).toBe(false);
    expect(m.exportContextOptions).toEqual({ willReadFrequently: false });
  });

  it('stays on when the setting is true or missing', async () => {
    vi.stubGlobal('window', { frameling: { tuning: {} } });
    vi.resetModules();
    expect((await import('../../src/export/readback')).READBACK_FLAG).toBe(true);
  });
});
