// Where the perf harness window goes: on-screen under xvfb (it is never drawn off-screen there), parked off-screen on a real desktop.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const { keepOnScreen } = createRequire(import.meta.url)('../../scripts/perf/display.cjs') as {
  keepOnScreen: (env: Record<string, string | undefined>, virtual: () => boolean) => boolean;
};

describe('keepOnScreen', () => {
  it('follows the display when nothing is set', () => {
    expect(keepOnScreen({}, () => true)).toBe(true);
    expect(keepOnScreen({}, () => false)).toBe(false);
  });
  it('lets PERF_ONSCREEN force either way', () => {
    expect(keepOnScreen({ PERF_ONSCREEN: '1' }, () => false)).toBe(true);
    expect(keepOnScreen({ PERF_ONSCREEN: '0' }, () => true)).toBe(false);
  });
});
