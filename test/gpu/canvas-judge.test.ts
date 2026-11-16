// The judge behind scripts/e2e/gpu-canvas.cjs: an empty canvas, or one that is not the file's drawing, must fail, and a
// drawing must pass. This is what stops a graphics flag that blanks the canvas from ever shipping.
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const req = createRequire(import.meta.url);
const root = path.resolve(__dirname, '../..');
const { judgeCanvas } = req(path.join(root, 'scripts/lib/canvas-judge.cjs')) as { judgeCanvas: (cells: number[][], reference?: number[][] | null, o?: object) => string[] };
const { CONFIGS } = req(path.join(root, 'scripts/e2e/gpu-canvas.cjs')) as { CONFIGS: { name: string; env: Record<string, string>; args?: string[]; ship: boolean }[] };

const flat = (rgb: number[], n = 576) => Array.from({ length: n }, () => [...rgb]);
/** A cream page with a pink ball in the middle: what the bouncing ball starter looks like from far off. */
const drawing = () => {
  const cells = flat([255, 250, 240]);
  for (let i = 250; i < 270; i++) cells[i] = [240, 90, 130];
  return cells;
};

describe('judging the canvas of the window', () => {
  it('passes a drawing that matches the software drawing', () => expect(judgeCanvas(drawing(), drawing())).toEqual([]));
  it('fails an empty canvas, which is the blank canvas the user saw (every layer in the file, nothing on screen)', () => {
    expect(judgeCanvas(flat([255, 250, 240]), drawing())[0]).toMatch(/empty/);
    expect(judgeCanvas(flat([0, 0, 0]), drawing())[0]).toMatch(/empty/);
  });
  it('fails a canvas that shows the page but not the drawing (the pink ball gone, the cream paper still there), which an average would miss', () => {
    const paperOnly = flat([255, 250, 240]);
    paperOnly[0] = [20, 20, 30]; // the dark margin around the paper: the picture still "varies"
    const ref = drawing();
    ref[0] = [20, 20, 30];
    expect(judgeCanvas(paperOnly, ref)[0]).toMatch(/does not match/);
  });
  it('fails a canvas with no reference too, when it is one flat colour', () => expect(judgeCanvas(flat([30, 30, 30]), null)[0]).toMatch(/empty/));
  it('fails a canvas that is drawn but is not this drawing', () => {
    const other = flat([255, 250, 240]);
    for (let i = 0; i < 80; i++) other[i] = [20, 20, 200];
    expect(judgeCanvas(other, drawing())[0]).toMatch(/does not match/);
  });
  it('lets a few levels of difference between two drivers through', () => expect(judgeCanvas(drawing().map((c) => c.map((v) => v - 2)), drawing())).toEqual([]));
  it('fails when there is no picture at all', () => expect(judgeCanvas([], null).length).toBe(1));
});

describe('what the canvas check covers', () => {
  const ships = CONFIGS.filter((c) => c.ship);
  it('runs the software control and the two ways a person gets the card', () => expect(ships.map((c) => c.name)).toEqual(['software', 'as-shipped', 'full']));
  it('never ships a Vulkan switch: anything that reaches people is checked, and Vulkan is only explored', () => {
    for (const c of ships) expect(JSON.stringify([c.env, c.args ?? []])).not.toMatch(/vulkan/i);
    for (const c of CONFIGS.filter((x) => /vulkan/i.test(x.name))) expect(c.ship).toBe(false);
  });
});
