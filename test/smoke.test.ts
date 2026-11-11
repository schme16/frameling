import { describe, expect, it } from 'vitest';
import pkg from '../package.json';

describe('package', () => {
  it('builds all three desktop targets', () => {
    expect(pkg.build.linux.target).toContain('AppImage');
    expect(pkg.build.win.target).toContain('nsis');
    expect(pkg.build.mac.target).toContain('dmg');
  });
});
