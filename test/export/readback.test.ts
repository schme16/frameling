import { afterEach, describe, expect, it, vi } from 'vitest';

// The export canvases' willReadFrequently flag: off, because measured it costs more in card-to-processor copies than
// it saves on reading back (see src/export/readback.ts). FRAMELING_EXPORT_READBACK=1 on the desktop side puts it back.
describe('export read-back flag', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('is off when nothing says otherwise', async () => {
    vi.resetModules();
    const m = await import('../../src/export/readback');
    expect(m.READBACK_FLAG).toBe(false);
    expect(m.exportContextOptions).toEqual({ willReadFrequently: false });
  });

  it('is on when the desktop side asks for it', async () => {
    vi.stubGlobal('window', { frameling: { tuning: { exportReadback: true } } });
    vi.resetModules();
    const m = await import('../../src/export/readback');
    expect(m.READBACK_FLAG).toBe(true);
    expect(m.exportContextOptions).toEqual({ willReadFrequently: true });
  });

  it('stays off when the setting is missing, so a stale preload cannot turn it back on', async () => {
    vi.stubGlobal('window', { frameling: { tuning: {} } });
    vi.resetModules();
    expect((await import('../../src/export/readback')).READBACK_FLAG).toBe(false);
  });
});
