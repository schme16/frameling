// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DEFAULT_FILL, themeFill } from '../../src/tools/wells';

// wells.ts reads the theme on the first animation frame after it loads, which caches the fallback gold. A token written
// after that is only seen once the theme watcher (a MutationObserver) has cleared the cache, so the test lets it run.
const settle = () => new Promise((r) => setTimeout(r));

describe('the default fill comes from the theme', () => {
  it("uses the theme's highlight colour", async () => {
    await new Promise((r) => setTimeout(r, 40)); // let the first-frame read happen, so the order never depends on timing
    document.documentElement.style.setProperty('--chosen-bg', '#22C3D6');
    await settle();
    expect(themeFill()).toBe('#22c3d6');
  });
  it('falls back to gold when there is no theme to ask', () => {
    expect(DEFAULT_FILL).toBe('#ffc94a');
  });
});
