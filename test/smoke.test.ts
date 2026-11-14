import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// The installer settings (electron-builder.cjs, which used to be "build" in package.json).
const cfg = createRequire(import.meta.url)('../electron-builder.cjs');

describe('package', () => {
  it('builds all three desktop targets', () => {
    expect(cfg.linux.target).toContain('AppImage');
    expect(cfg.win.target).toContain('nsis');
    expect(cfg.mac.target).toContain('dmg');
  });
});
