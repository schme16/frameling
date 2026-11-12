// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { flushTheme } from '../../src/canvas/theme';
import { DEFAULT_FILL, themeFill } from '../../src/tools/wells';

describe('the default fill comes from the theme', () => {
  it("uses the theme's highlight colour", () => {
    document.documentElement.style.setProperty('--chosen-bg', '#22C3D6');
    flushTheme();
    expect(themeFill()).toBe('#22c3d6');
  });
  it('falls back to gold when there is no theme to ask', () => {
    expect(DEFAULT_FILL).toBe('#ffc94a');
  });
});
