// @vitest-environment jsdom
// One skeleton for both sides (card pixel-brush-parity, piece 4): the vector Brush and every pixel brush tool read the same
// top to bottom (the big preview, the titled Brush picker, the parts, the paper, Size, then Save and Share, then the folds),
// and what the parts say and do is true on a pixel brush too: Tip and Stick pickers that list what the engine has, a status
// beside each that says "changed", a reset, and Back to how it came.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/brushes';
import '../../src/dab';
import { preloadPicker } from './preloadPicker';
import * as P from '../../src/brushes/presets';
import { getCommand } from '../../src/core/registry';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { defaultTip } from '../../src/geometry/tip';
import { DryOptionsPanel } from '../../src/dry/Options';
import { DabOptionsPanel } from '../../src/dab/Options';
import { SoftOptionsFor } from '../../src/soft/Options';
import { BrushOptions } from '../../src/tools/options/BrushOptions';
import { getDab, resetDab, setDab } from '../../src/dab/settings';
import { getDry, resetDry } from '../../src/dry/settings';
import { resetSoft } from '../../src/soft/settings';
import { pickStick, pickTip } from '../../src/brushes/tips';
import { partsNow, resetStick, resetTip } from '../../src/brushes/partsActions';
import { currentSpec } from '../../src/dab/live';
import { flashFor } from '../../src/brushes/parts';
import { currentFlash } from '../../src/brushes/flash';

vi.mock('../../src/brushes/thumbs', async (orig) => ({ ...(await orig<typeof import('../../src/brushes/thumbs')>()), drawPreviewStroke: () => undefined }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
let stop: () => void;
beforeAll(async () => {
  const noop = new Proxy(() => undefined, { get: () => noop, apply: () => undefined });
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'createImageData' ? (w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }) : noop) });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
  await preloadPicker();
});
beforeEach(() => {
  localStorage.clear();
  for (const p of [...P.myBrushes()]) {
    P.applyPreset(p.id);
    void P.deleteActive();
  }
  resetDab();
  resetDry();
  resetSoft();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  stop = P.startBrushPresets();
});
afterEach(() => {
  stop();
  act(() => root.unmount());
  host.remove();
});

const ids = () => [...host.querySelectorAll('[data-control]')].map((e) => e.getAttribute('data-control')!);
const show = (tool: string, node: ReactNode, pixel = true) => {
  resetStore(pixel ? newDoc({ pixel: { pixelSize: 8 } }) : newDoc());
  store().setUi({ tool });
  act(() => root.render(node));
};
/** True when each id comes after the one before it (others may sit between). */
const inOrder = (all: string[], want: string[]): boolean => {
  let at = -1;
  return want.every((w) => (at = all.indexOf(w, at + 1)) >= 0);
};

describe('the skeleton', () => {
  it('puts the vector Brush in the order: preview, Brush, Tip, Paper, Size, Save as', () => {
    show('brush', <BrushOptions />, false);
    act(() => store().setUi((u) => ({ brush: { ...u.brush, tip: { ...defaultTip('chalk') } } })));
    expect(inOrder(ids(), ['preview', 'brush-picker', 'tip-picker', 'stick-picker', 'paper', 'size', 'save-as']), ids().join(' ')).toBe(true);
  });
  it('puts the Pixel brush in the same order', () => {
    show('pixel-brush', <DabOptionsPanel />);
    expect(inOrder(ids(), ['preview', 'brush-picker', 'tip-picker', 'paper', 'size', 'spacing', 'save-as'])).toBe(true);
  });
  it('puts Chalk and charcoal in the same order, with its Stick as the part', () => {
    show('charcoal', <DryOptionsPanel />);
    expect(inOrder(ids(), ['preview', 'brush-picker', 'stick-picker', 'paper', 'size', 'press', 'save-as'])).toBe(true);
  });
  it('puts Soft paint in the same order, with no parts to show', () => {
    show('soft-brush', <>{(() => { const C = SoftOptionsFor('soft-brush'); return <C />; })()}</>);
    expect(inOrder(ids(), ['preview', 'brush-picker', 'size', 'hardness', 'flow', 'save-as'])).toBe(true);
    expect(ids()).not.toContain('tip-picker');
    expect(ids()).not.toContain('stick-picker');
    expect(host.querySelector('.bp-parts')).toBeNull();
  });
  it('titles the Brush picker the same on both sides', () => {
    show('pixel-brush', <DabOptionsPanel />);
    expect([...host.querySelectorAll('.tp-label')].map((e) => e.textContent)).toContain('Brush');
  });
  it('gives every pixel panel the big preview', () => {
    for (const [tool, node] of [['pixel-brush', <DabOptionsPanel />], ['charcoal', <DryOptionsPanel />]] as const) {
      show(tool, node);
      expect(host.querySelector('canvas.cv-preview[data-control="preview"]')).not.toBeNull();
    }
  });
});

describe('the Tip and Stick on a pixel brush', () => {
  const open = (sel: string) => act(() => host.querySelector<HTMLButtonElement>(`${sel} .pk-btn`)!.click());
  const rows = () => [...document.querySelectorAll('.pk-pop .pk-name-text')].map((e) => e.textContent);
  it('list what the pixel engine has under the Tip', () => {
    show('pixel-brush', <DabOptionsPanel />);
    open('[data-testid="brush-tips"]');
    expect(rows()).toEqual(['Round', 'Square', 'Picture']);
  });
  it('list the nine sticks under the Stick', () => {
    show('charcoal', <DryOptionsPanel />);
    open('[data-testid="brush-stick"]');
    expect(rows()).toHaveLength(9);
    expect(rows()).toContain('Oil pastel');
  });
  it('pick a tip and a stick through the same picks as the vector side', () => {
    expect(pickTip('ptip:square')).toBe(true);
    expect(getDab().tip).toBe('square');
    expect(pickStick('pstick:crayon')).toBe(true);
    expect(getDry().medium).toBe('crayon');
  });
});

describe('what the parts say on a pixel brush', () => {
  it('says changed for the tip, offers a reset and puts it back, then Back to how it came', () => {
    store().setUi({ tool: 'pixel-brush' });
    P.applyPreset('starter:px-round6');
    show('pixel-brush', <DabOptionsPanel />);
    expect(partsNow().changed).toBe(false);
    expect(host.querySelector('.bp-st')!.textContent).toContain('as it comes');
    act(() => void setDab({ tip: 'square', size: 12 }));
    expect(partsNow()).toMatchObject({ changed: true, tip: true, other: true });
    expect(host.querySelector('.bp-st')!.textContent).toContain('changed');
    expect(host.querySelector('[data-control="reset-tip"]')).not.toBeNull();
    expect(host.querySelector('[data-control="revert"]')).not.toBeNull();
    act(() => void resetTip());
    expect(getDab().tip).toBe('round');
    expect(getDab().size).toBe(12);
    act(() => void getCommand('brush.backToHowItCame')!.run());
    expect(getDab().size).toBe(6);
    expect(partsNow().changed).toBe(false);
  });
  it('puts the stick back on Chalk and charcoal', () => {
    store().setUi({ tool: 'charcoal' });
    P.applyPreset('starter:px-chalk');
    show('charcoal', <DryOptionsPanel />);
    act(() => void pickStick('pstick:crayon'));
    expect(partsNow().stick).toBe(true);
    act(() => void resetStick());
    expect(getDry().medium).toBe('chalk');
    expect(currentSpec()).toMatchObject({ kind: 'dry', medium: 'chalk' });
  });
  it('flashes the tip that changed', () => {
    const base = { id: 'a', name: 'A', brush: store().get().ui.brush, paper: 'medium' as const };
    const a = { ...base, pixel: { tip: 'round', tipName: 'Round', stick: null, stickName: 'Chalk' } };
    const b = { ...base, pixel: { tip: 'square', tipName: 'Square', stick: null, stickName: 'Chalk' } };
    expect(flashFor(a, b)).toEqual({ parts: ['tip'], text: 'Tip: Square' });
    expect(flashFor(a, { ...a, pixel: { ...a.pixel, stick: 'crayon', stickName: 'Crayon' } })).toEqual({ parts: ['stick'], text: 'Stick: Crayon' });
    expect(currentFlash().parts).toBeDefined();
  });
});
