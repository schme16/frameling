// @vitest-environment jsdom
// The pixel side of the brush picker: the same picker, showing pixel brushes when you are on a pixel brush tool, saving and
// picking them, and never mixing the two sides.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import '../../src/brushes';
import '../../src/dab';
import { preloadPicker } from './preloadPicker';
import { BrushPresetRow } from '../../src/brushes/BrushPresetRow';
import { PIXEL_STARTERS, STARTERS } from '../../src/brushes/model';
import * as P from '../../src/brushes/presets';
import * as K from '../../src/brushes/picker';
import { newDoc } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { DEFAULT_DAB } from '../../src/dab/maths';
import { getDab, resetDab, setDab } from '../../src/dab/settings';
import { getSoft, resetSoft } from '../../src/soft/settings';
import { resetDry } from '../../src/dry/settings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLElement;
let root: Root;
let stop: () => void;
const btn = () => host.querySelector<HTMLButtonElement>('.pk-btn')!;
const rows = () => [...document.querySelectorAll<HTMLElement>('.pk-pop .pk-row')];
const names = () => rows().map((r) => r.querySelector('.pk-name-text')!.textContent);
const heads = () => [...document.querySelectorAll<HTMLButtonElement>('.pk-group')];
const head = (text: string) => heads().find((h) => h.querySelector('.pk-group-name')!.textContent === text)!;
const open = () =>
  act(() => {
    btn().focus();
    btn().click();
  });
const names2 = () => host.querySelector('.pk-btn-name')!.textContent;

beforeAll(preloadPicker);

beforeEach(() => {
  localStorage.clear();
  resetStore(newDoc());
  for (const p of [...P.myBrushes()]) {
    P.applyPreset(p.id);
    P.deleteActive();
  }
  resetDab();
  resetDry();
  resetSoft();
  P.startNaming(null);
  K._resetPickerForTests();
  K.setOpenGroups(null);
  store().setUi({ tool: 'pixel-brush' });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  stop = P.startBrushPresets();
  act(() => root.render(<BrushPresetRow side="pixel" />));
});
afterEach(() => {
  stop();
  act(() => root.unmount());
  host.remove();
});

describe('the pixel side of the picker', () => {
  it('lists the pixel brushes and not the vector ones', () => {
    open();
    for (const h of heads()) if (h.getAttribute('aria-expanded') === 'false') act(() => h.click());
    const shown = names();
    expect(shown).toContain(PIXEL_STARTERS[0].name);
    for (const s of STARTERS) expect(shown).not.toContain(s.name);
    // The count is in the open list, not on the button.
    expect(document.querySelector('.pk-pop .pk-label')!.textContent).toContain(String(PIXEL_STARTERS.length));
  });

  it('lights the brush in use, and says Custom pixel brush when it matches none', () => {
    expect(names2()).toBe('Round 6');
    act(() => setDab({ size: 13 }));
    expect(names2()).toBe('Custom pixel brush');
  });

  it('puts a picked brush on the pixel brush and picks the tool, from any pixel tool', () => {
    store().setUi({ tool: 'airbrush' });
    open();
    act(() => head('Scatter and spray').click());
    const speckle = rows().find((r) => r.querySelector('.pk-name-text')!.textContent === 'Speckle')!;
    act(() => speckle.click());
    expect(getDab()).toMatchObject({ size: 3, scatter: 1.2, sizeJitter: 0.6 });
    expect(store().get().ui.tool).toBe('pixel-brush');
  });

  it('puts a soft paint brush back on its own tool', () => {
    open();
    act(() => head('Soft paint').click());
    act(() => rows().find((r) => r.querySelector('.pk-name-text')!.textContent === 'Pixel airbrush')!.click());
    expect(store().get().ui.tool).toBe('airbrush');
    expect(getSoft().tools.airbrush.size).toBe(28);
  });

  it('saves the pixel brush in use as a pixel brush, and the vector side never sees it', () => {
    act(() => setDab({ size: 17, spacing: 1.5 }));
    act(() => void P.saveCurrentAs('Fat dots'));
    const mine = P.myBrushes();
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ name: 'Fat dots', tool: 'pixel' });
    expect(mine[0].pixel).toMatchObject({ kind: 'dab', dab: { size: 17, spacing: 1.5 } });
    expect(P.brushesOnSide('vector').some((p) => p.name === 'Fat dots')).toBe(false);
    expect(names2()).toBe('Fat dots');
  });

  it('marks it changed after a slider moves, and updates it', () => {
    act(() => setDab({ size: 17 }));
    act(() => void P.saveCurrentAs('Fat'));
    act(() => setDab({ size: 18 }));
    expect(P.currentPixelState()).toEqual({ activeId: P.myBrushes()[0].id, changed: true });
    act(() => void P.updateActive());
    expect(P.myBrushes()[0].pixel).toMatchObject({ dab: { size: 18 } });
    expect(P.currentPixelState().changed).toBe(false);
  });

  it('steps through the pixel brushes with Next and Previous, wrapping', () => {
    act(() => void P.applyPreset(PIXEL_STARTERS[0].id));
    P.stepBrush(-1);
    expect(P.currentPixelState().activeId).toBe(PIXEL_STARTERS.at(-1)!.id);
    P.stepBrush(1);
    expect(P.currentPixelState().activeId).toBe(PIXEL_STARTERS[0].id);
  });

  it('keeps the brush as it was when you move between pixel tools', () => {
    act(() => setDab({ size: 17 }));
    act(() => store().setUi({ tool: 'charcoal' }));
    expect(names2()).toBe('Compressed charcoal on paper');
    act(() => store().setUi({ tool: 'pixel-brush' }));
    expect(getDab().size).toBe(17);
    expect(getDab().tip).toBe(DEFAULT_DAB.tip);
  });
});
