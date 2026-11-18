// @vitest-environment jsdom
// The panel of a brush that follows the layer (piece 6): picking a brush made for the other kind of layer does not read as
// changed, says what this kind of layer cannot draw in one line with the controls greyed behind it, and says nothing for a
// brush that has both halves made.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/brushes';
import '../../src/dab';
import { preloadPicker } from './preloadPicker';
import * as P from '../../src/brushes/presets';
import { newDoc, newPixelLayer } from '../../src/core/doc';
import { getCommand } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { BrushOptions } from '../../src/tools/options/BrushOptions';
import { resetDab } from '../../src/dab/settings';
import { DEFAULT_DAB } from '../../src/dab/maths';
import { stampPicture } from '../../src/brushes/pixelStarters';
import { resetDry } from '../../src/dry/settings';
import { resetSoft } from '../../src/soft/settings';
import { setFold } from '../../src/canvas/folds';

vi.mock('../../src/brushes/thumbs', async (orig) => ({ ...(await orig<typeof import('../../src/brushes/thumbs')>()), drawPreviewStroke: () => undefined }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
let stop: () => void = () => {};
beforeAll(async () => {
  const noop = new Proxy(() => undefined, { get: () => noop, apply: () => undefined });
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'createImageData' ? (w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)) }) : noop) });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];
  await preloadPicker();
});
beforeEach(() => {
  stop();
  localStorage.clear();
  resetDab();
  resetDry();
  resetSoft();
  setFold('kept', false);
  const d = newDoc();
  const px = newPixelLayer('Pixels', 8);
  d.layers.push(px);
  resetStore(d);
  ids = { vector: d.layers[0].id, pixel: px.id };
  store().setUi({ activeLayerId: ids.vector, tool: 'brush' });
  P.pickNone();
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
let ids = { vector: '', pixel: '' };
const on = (kind: 'vector' | 'pixel') => act(() => store().setUi({ activeLayerId: ids[kind] }));
const show = () => act(() => root.render(<BrushOptions />));
const controls = () => [...host.querySelectorAll('[data-control]')].map((e) => e.getAttribute('data-control')!);

describe('a brush made for the other kind of layer', () => {
  it('is not changed when you pick it, and its panel says what is kept, on a vector layer', () => {
    show();
    act(() => void P.applyPreset('starter:px-wet-smear'));
    expect(host.querySelector('.bp-part[data-changed="true"]')).toBeNull();
    expect(host.querySelector('[data-control="kept-note"] .bp-kept-line')!.textContent).toBe("Wet paint and Hardness are kept, but vectors don't draw them.");
    act(() => host.querySelector<HTMLButtonElement>('[data-fold="kept"]')!.click());
    expect(controls()).toEqual(expect.arrayContaining(['wet-paint', 'hardness']));
    for (const row of host.querySelectorAll('.bp-kept-row')) expect(row.getAttribute('aria-disabled')).toBe('true');
  });
  it('says what a pixel layer cannot draw of a vector brush, on a pixel layer', () => {
    on('pixel');
    show();
    act(() => void P.applyPreset('starter:oil'));
    expect(host.querySelector('[data-control="kept-note"] .bp-kept-line')!.textContent).toMatch(/^Bristles, Stiffness, .* are kept, but pixels don't draw them\.$/);
  });
  it('follows you: the same brush shows the line on the one layer and not the other, and nothing changes in between', () => {
    show();
    act(() => void P.applyPreset('starter:px-wet-smear'));
    expect(host.querySelector('[data-control="kept-note"]')).not.toBeNull();
    on('pixel');
    expect(host.querySelector('[data-control="kept-note"]')).toBeNull();
    expect(host.querySelector('.bp-part[data-changed="true"]')).toBeNull();
    on('vector');
    expect(host.querySelector('[data-control="kept-note"]')).not.toBeNull();
  });
  it('shows nothing for a brush with both halves made, or when nothing is picked', () => {
    show();
    expect(host.querySelector('[data-control="kept-note"]')).toBeNull();
    act(() => void P.applyPreset('starter:leaves'));
    expect(host.querySelector('[data-control="kept-note"]')).toBeNull();
    on('pixel');
    expect(host.querySelector('[data-control="kept-note"]')).toBeNull();
  });
  it('is not changed for a picture brush brought in from another program, on either kind of layer', () => {
    show();
    P.addImportedBrushes([{ name: 'Imported', dab: { ...DEFAULT_DAB, tip: 'picture', picture: stampPicture('leaf'), size: 20, spacing: 1.3 } }], 'G');
    act(() => void P.applyPreset(P.myBrushes().at(-1)!.id));
    expect(host.querySelector('.bp-part[data-changed="true"]')).toBeNull();
    on('pixel');
    expect(host.querySelector('.bp-part[data-changed="true"]')).toBeNull();
  });
  it('has a command that opens what is kept, greyed with a reason when there is nothing to show', () => {
    show();
    const cmd = getCommand('brush.kept')!;
    expect(cmd.enabled!(store().get() as never)).toBe(false);
    expect(cmd.reason!(store().get() as never)).toBe('Pick a brush first');
    act(() => void P.applyPreset('starter:px-wet-smear'));
    expect(cmd.enabled!(store().get() as never)).toBe(true);
    act(() => void cmd.run());
    expect(host.querySelector('[data-fold="kept"]')!.getAttribute('aria-expanded')).toBe('true');
    act(() => void P.applyPreset('starter:leaves'));
    expect(cmd.enabled!(store().get() as never)).toBe(false);
    expect(cmd.reason!(store().get() as never)).toBe('This kind of layer draws all of the brush you picked');
  });
});
