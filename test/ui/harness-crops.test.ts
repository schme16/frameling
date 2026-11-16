// The help harness measures the stage when a picture is taken, so its crops and aiming never carry numbers copied from the app.
// These are the sums behind that (scripts/docs/steps.cjs), checked with a stage box like the one the app has at 1280 x 800.
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const steps = require(path.resolve(__dirname, '../../scripts/docs/steps.cjs')) as {
  cropFromBox: (r: number[], o: Record<string, unknown>, width: number, height: number) => number[];
  resolvePoint: (b: number[], v: Record<string, unknown>) => number[];
};
const STAGE = [143, 47, 734, 444];

describe('stage crops', () => {
  it('is the stage itself with no options', () => {
    expect(steps.cropFromBox(STAGE, {}, 1280, 800)).toEqual([143, 47, 734, 444]);
  });
  it('stretches to the right edge of the window, leaving the gap', () => {
    expect(steps.cropFromBox(STAGE, { rightGap: 80 }, 1280, 800)).toEqual([143, 47, 1056, 444]);
  });
  it('adds height below, moves the top down, or sets the height', () => {
    expect(steps.cropFromBox(STAGE, { down: 109 }, 1280, 800)[3]).toBe(552);
    expect(steps.cropFromBox(STAGE, { top: 458, height: 235 }, 1280, 800)).toEqual([143, 505, 734, 234]);
    expect(steps.cropFromBox(STAGE, { height: 380 }, 1280, 800)[3]).toBe(380);
  });
  it('takes a window of a given size round the stage middle', () => {
    expect(steps.cropFromBox(STAGE, { around: [560, 320] }, 1280, 800)).toEqual([230, 109, 560, 320]);
  });
  it('stays inside the window and keeps sizes even, which H.264 needs', () => {
    const c = steps.cropFromBox([143.4, 47, 733.5, 443.9], { rightGap: 0, down: 900 }, 1280, 800);
    expect(c[0] + c[2]).toBeLessThanOrEqual(1280);
    expect(c[1] + c[3]).toBeLessThanOrEqual(800);
    expect(c[2] % 2).toBe(0);
    expect(c[3] % 2).toBe(0);
  });
});

describe('stage points', () => {
  it('puts the point at the middle of the stage when it is the one the view is centred on', () => {
    expect(steps.resolvePoint(STAGE, { stagePoint: { x: 640, y: 360, z: 0.5, cx: 640, cy: 360 } })).toEqual([510, 269]);
  });
  it('moves with the stage, so a wider rail cannot shift the aim', () => {
    const p = { stagePoint: { x: 740, y: 360, z: 0.5, cx: 640, cy: 360 } };
    expect(steps.resolvePoint(STAGE, p)).toEqual([560, 269]);
    expect(steps.resolvePoint([113, 47, 764, 444], p)).toEqual([545, 269]);
  });
  it('measures a stage edge spot from the top left corner', () => {
    expect(steps.resolvePoint(STAGE, { stageEdge: { x: 10, y: 283 } })).toEqual([153, 330]);
  });
});

describe('the rig and tween clips', () => {
  const entries = require(path.resolve(__dirname, '../../scripts/docs/help/animate.cjs')) as { name: string; steps: Record<string, unknown>[] }[];
  const names = ['rig', 'rig-stretch', 'rig-bones', 'rig-bend', 'rig-weights', 'rig-posing', 'rig-bone-tools', 'motion-paths', 'tweens', 'shape-tweens', 'one-click-motions', 'camera', 'lip-sync', 'rig-attach', 'rig-pose-library'];
  it.each(names)('%s aims at the stage or a button by name, never at a window position', (name) => {
    const e = entries.find((x) => x.name === name);
    expect(e).toBeTruthy();
    const text = JSON.stringify(e!.steps);
    // a click or drag written as plain window numbers (parking the pointer out of the way is fine)
    expect(text).not.toMatch(/"click":\[\d/);
    expect(text).not.toMatch(/"drag":\[\[\d/);
  });
  it('finds the squash and stretch slider by its label and a point along it', () => {
    const e = entries.find((x) => x.name === 'rig-stretch')!;
    const slider = e.steps.filter((s) => s.dragOn === 'input.cv-slider');
    expect(slider.length).toBeGreaterThan(1);
    for (const s of slider) expect(s.text).toBe('Squash and stretch');
  });
});
