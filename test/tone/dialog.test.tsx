// @vitest-environment jsdom
// The Curves and Levels dialog and commands on a real pixel layer: what is offered when, the controls, Apply as one undo step
// with the right name, a selection and a locked palette being honoured, and the one-step auto levels.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCommand } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { gridPixels } from '../../src/core/pixelBounds';
import { activeDrawing, activeGrid, setActivePixels } from '../../src/tools/edit';
import { setPixelSelection } from '../../src/select/pixel-state';
import { applyTone, histogramHeights, toneLabel, toneProblem, ToneDialog } from '../../src/tone/ToneDialog';
import { autoLevels } from '../../src/tone/commands';
import { neutralTone, type Tone } from '../../src/tone/maths';
import { CURVE_PRESETS } from '../../src/tone/maths';
import { contentBox, cropTo, shrinkToFit } from '../../src/tone/preview';
import { pixelStore, vectorStore } from '../tools/helpers';
import '../../src/tone';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const N = 64;
const grid = () => gridPixels(activeDrawing() as never, activeGrid()!.width, activeGrid()!.height);
const at = (x: number, y: number) => Array.from(grid().slice((y * N + x) * 4, (y * N + x) * 4 + 4));

/** A flat, washed out picture: every pixel between 90 and 170. */
function seedFlat(): void {
  const px = new Uint8ClampedArray(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = 90 + Math.round((x / (N - 1)) * 80);
    px.set([v, v, v, 255], (y * N + x) * 4);
  }
  expect(setActivePixels('seed', px)).toBe('ok');
}

let host: HTMLElement | null = null;
let root: Root | null = null;
beforeEach(() => {
  pixelStore(1);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = root = null;
  setPixelSelection(null);
});

describe('when it is on offer', () => {
  it('says there is nothing to work on before anything is drawn, and works once something is', () => {
    expect(toneProblem()).toMatch(/nothing drawn/);
    expect(getCommand('tone.curves')!.enabled?.(store().get())).toBeFalsy();
    expect(getCommand('tone.curves')!.reason?.(store().get())).toMatch(/nothing drawn/);
    seedFlat();
    expect(toneProblem()).toBeNull();
    expect(getCommand('tone.curves')!.enabled?.(store().get())).toBe(true);
  });

  it('says what it needs on a vector layer', () => {
    vectorStore();
    expect(toneProblem()).toMatch(/pixel layer/);
    expect(getCommand('tone.levels')!.reason?.(store().get())).toMatch(/pixel layer/);
  });

  it('has a command each for Curves, Levels and the one step auto levels, with the same help', () => {
    for (const id of ['tone.curves', 'tone.levels', 'tone.auto']) {
      expect(getCommand(id), id).toBeTruthy();
      expect(getCommand(id)!.help).toBe('curves-levels');
    }
    expect(getCommand('tone.curves')!.keys?.length).toBeGreaterThan(0);
    expect(getCommand('tone.levels')!.keys?.length).toBeGreaterThan(0);
  });
});

describe('applying a change', () => {
  it('changes the pixels in one undo step, named for what was changed', () => {
    seedFlat();
    const before = grid().slice();
    const t: Tone = neutralTone();
    t.levels.all = { black: 90, white: 170, gamma: 1 };
    expect(toneLabel(t)).toBe('Levels');
    expect(applyTone(t)).toBe(true);
    // The darkest pixel is black now and the lightest white: the range is stretched.
    expect(at(0, 3)).toEqual([0, 0, 0, 255]);
    expect(at(N - 1, 3)).toEqual([255, 255, 255, 255]);
    expect(store().undoLabel()).toMatch(/Levels/);
    store().undo();
    expect(Array.from(grid())).toEqual(Array.from(before));
  });

  it('names a curve change and a change to both', () => {
    const t = neutralTone();
    t.curves.all = CURVE_PRESETS[2].curve;
    expect(toneLabel(t)).toBe('Curves');
    t.levels.r = { black: 10, white: 255, gamma: 1 };
    expect(toneLabel(t)).toBe('Levels and curves');
  });

  it('keeps the change inside a selection', () => {
    seedFlat();
    const bits = new Uint8Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N / 2; x++) bits[y * N + x] = 1;
    setPixelSelection({ width: N, height: N, bits } as never);
    const t = neutralTone();
    t.curves.all = [{ x: 0, y: 255 }, { x: 255, y: 0 }];
    const right = at(50, 2);
    expect(applyTone(t)).toBe(true);
    expect(at(50, 2)).toEqual(right);
    expect(at(2, 2)).not.toEqual(right);
  });

  it('on a layer that keeps to a palette, every pixel is still a palette colour afterwards', () => {
    seedFlat();
    store().update('lock', (d) => {
      const l = d.layers.find((x) => x.kind === 'pixel');
      if (l && l.kind === 'pixel') l.paletteLock = true;
      d.palette = { name: 'two', colors: ['#000000', '#ffffff'] } as never;
    });
    const t = neutralTone();
    t.levels.all = { black: 90, white: 170, gamma: 1 };
    expect(applyTone(t)).toBe(true);
    const px = grid();
    for (let i = 0; i < px.length; i += 4) {
      const v = px[i];
      expect(v === 0 || v === 255).toBe(true);
    }
  });
});

describe('auto levels, in one step', () => {
  it('stretches a flat picture to the whole range, and says so when there is nothing to stretch', () => {
    seedFlat();
    expect(autoLevels()).toBe(true);
    const px = grid();
    expect(Math.min(...Array.from(px).filter((_, i) => i % 4 === 0))).toBe(0);
    expect(Math.max(...Array.from(px).filter((_, i) => i % 4 === 0))).toBe(255);
    store().undo();
    const flat = new Uint8ClampedArray(N * N * 4);
    for (let i = 0; i < N * N; i++) flat.set([100, 100, 100, 255], i * 4);
    setActivePixels('seed', flat);
    expect(autoLevels()).toBe(false);
  });
});

describe('the dialog', () => {
  const mount = (apply: (t: Tone) => void = () => {}, tab: 'levels' | 'curves' = 'curves') => {
    seedFlat();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const img = { width: N, height: N, pixels: grid() };
    act(() => root!.render(<ToneDialog img={img} tab={tab} close={() => {}} apply={apply} />));
  };
  const click = (el: Element | null) => act(() => void (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })));
  const button = (text: string) => [...host!.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) ?? null;

  it('opens on the tab asked for, with both tabs and the four colour choices', () => {
    mount(() => {}, 'levels');
    expect(host!.querySelector('[data-testid="tone-levels"]')).toBeTruthy();
    expect(host!.querySelector('[data-testid="tone-curve"]')).toBeFalsy();
    click(host!.querySelector('[data-testid="tone-tab-curves"]'));
    expect(host!.querySelector('[data-testid="tone-curve"]')).toBeTruthy();
    expect([...host!.querySelectorAll('.tn-chan')].map((b) => b.textContent?.trim())).toEqual(['All colours', 'Red', 'Green', 'Blue']);
  });

  it('cannot apply until something has changed, and says Start again when it has', () => {
    mount();
    const apply = host!.querySelector<HTMLButtonElement>('[data-testid="tone-apply"]')!;
    expect(apply.disabled).toBe(true);
    click(button('More contrast'));
    expect(apply.disabled).toBe(false);
    click(button('Start again'));
    expect(apply.disabled).toBe(true);
  });

  it('hands the change to Apply: a ready made curve for all colours, then for red alone', () => {
    const got: Tone[] = [];
    mount((t) => got.push(t));
    click(button('More contrast'));
    click(host!.querySelector('[data-testid="tone-apply"]'));
    expect(got[0].curves.all).toEqual(CURVE_PRESETS.find((p) => p.id === 'contrast')!.curve);
    expect(got[0].curves.r).toEqual([{ x: 0, y: 0 }, { x: 255, y: 255 }]);
    click(host!.querySelector('.tn-chan[data-channel="r"]'));
    click(button('Lighter'));
    click(host!.querySelector('[data-testid="tone-apply"]'));
    expect(got[1].curves.r).toEqual(CURVE_PRESETS.find((p) => p.id === 'lighter')!.curve);
    expect(got[1].curves.g).toEqual([{ x: 0, y: 0 }, { x: 255, y: 255 }]);
  });

  it('stretches to fit with the auto button, putting the handles where the picture starts and ends', () => {
    const got: Tone[] = [];
    mount((t) => got.push(t), 'levels');
    click(button('Stretch to fit (auto)'));
    click(host!.querySelector('[data-testid="tone-apply"]'));
    expect(got[0].levels.all.black).toBeGreaterThanOrEqual(88);
    expect(got[0].levels.all.black).toBeLessThanOrEqual(100);
    expect(got[0].levels.all.white).toBeLessThanOrEqual(171);
    expect(got[0].levels.all.white).toBeGreaterThanOrEqual(160);
  });

  it('moves a curve point with the arrow keys and takes it away with Delete', () => {
    const got: Tone[] = [];
    mount((t) => got.push(t));
    click(button('Lighter'));
    const mid = () => host!.querySelectorAll<SVGCircleElement>('.tn-pt')[1];
    expect(host!.querySelectorAll('.tn-pt').length).toBe(3);
    const key = (k: string) => act(() => void mid().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })));
    key('ArrowUp');
    click(host!.querySelector('[data-testid="tone-apply"]'));
    expect(got[0].curves.all[1].y).toBe(165);
    key('Delete');
    expect(host!.querySelectorAll('.tn-pt').length).toBe(2);
  });

  it('types a number into Darkest and keeps it apart from Lightest', () => {
    const got: Tone[] = [];
    mount((t) => got.push(t), 'levels');
    const input = host!.querySelector<HTMLInputElement>('input[aria-label="Darkest"]')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '60');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click(host!.querySelector('[data-testid="tone-apply"]'));
    expect(got[0].levels.all.black).toBe(60);
    expect(got[0].levels.all.white).toBe(255);
  });
});

describe('the preview', () => {
  it('shrinks big pictures to fit and never blows small ones up', () => {
    const big = { width: 100, height: 50, pixels: new Uint8ClampedArray(100 * 50 * 4).fill(255) };
    const s = shrinkToFit(big, 40);
    expect(s.width).toBe(40);
    expect(s.height).toBe(20);
    expect(s.pixels.length).toBe(40 * 20 * 4);
    expect(shrinkToFit(big, 400)).toBe(big);
  });

  it('crops to what is painted, with a little room', () => {
    const px = new Uint8ClampedArray(20 * 20 * 4);
    px.set([1, 2, 3, 255], (10 * 20 + 12) * 4);
    const box = contentBox({ width: 20, height: 20, pixels: px }, 2)!;
    expect(box).toEqual({ x: 10, y: 8, w: 5, h: 5 });
    const c = cropTo({ width: 20, height: 20, pixels: px }, box);
    expect(Array.from(c.pixels.slice((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 4))).toEqual([1, 2, 3, 255]);
    expect(contentBox({ width: 4, height: 4, pixels: new Uint8ClampedArray(64) })).toBeNull();
  });

  it('cuts a tall spike at the end of a histogram short so the rest can be seen', () => {
    const h = new Uint32Array(256).fill(10);
    h[0] = 100000;
    const hs = histogramHeights(h);
    expect(hs[0]).toBe(1);
    expect(hs[100]).toBe(1);
    const flatter = new Uint32Array(256);
    flatter[100] = 50;
    flatter[101] = 100;
    expect(histogramHeights(flatter)[100]).toBeLessThanOrEqual(1);
  });
});

void vi;
