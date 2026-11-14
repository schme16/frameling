// @vitest-environment jsdom
// Masks in the layer list and the commands: add one in a press, see which layer is a mask and what it cuts, switch
// between painting the mask and the layer, turn it off and on, and what happens when it leaves its folder.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Layer } from '../../src/core/format';
import { newDoc, newVectorLayer } from '../../src/core/doc';
import { resetStore, store } from '../../src/core/store';
import { getCommand, allCommands } from '../../src/core/registry';
import { resetChoices, setChoice } from '../../src/core/choices';
import '../../src/renderer/features';
import { LayersPanel } from '../../src/timeline/LayersPanel';
import { setTl } from '../../src/timeline/state';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
});
beforeEach(() => {
  resetChoices();
  setTl({ cw: 20, clipId: null, editing: null });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = '';
});

function mount() {
  const doc = newDoc({ width: 8, height: 8 });
  doc.layers = ['a', 'b', 'top'].map((n) => Object.assign(newVectorLayer(n), { id: n }) as Layer);
  const s = resetStore(doc);
  s.setUi({ activeLayerId: 'b' });
  act(() => root.render(<LayersPanel />));
  return s;
}
const run = (id: string) => act(() => void getCommand(id)!.run());
const layers = () => store().get().doc.layers;
const row = (id: string) => host.querySelector<HTMLElement>(`[data-layer="${id}"]`)!;
const mask = () => layers().find((l) => l.mask)!;

describe('masks in the layer list', () => {
  it('every mask command is in the palette', () => {
    for (const id of ['layers.addMask', 'layers.useAsMask', 'layers.maskSwitch', 'layers.maskOnOff', 'layers.flipMask', 'layers.removeMask']) {
      expect(allCommands().some((c) => c.id === id), id).toBe(true);
    }
  });

  it('one press adds a mask above the layer and picks it, ready to paint', () => {
    mount();
    run('layers.addMask');
    const m = mask();
    expect(m.mask).toBe('show');
    expect(store().get().ui.activeLayerId).toBe(m.id);
    expect(layers().map((l) => l.id)).toEqual(['a', 'b', m.id, 'top']);
    expect(row(m.id).classList.contains('is-mask')).toBe(true);
    expect(row('b').classList.contains('is-masked')).toBe(true);
    expect(row('a').classList.contains('is-masked')).toBe(false);
    expect(row('top').classList.contains('is-masked')).toBe(false);
  });

  it('a mask says what it masks, and the layer says which mask', () => {
    mount();
    run('layers.addMask');
    const m = mask();
    const link = row(m.id).querySelector<HTMLButtonElement>('.tl-mask-link')!;
    expect(link.getAttribute('aria-label')).toMatch(/^Masks b\./);
    const back = row('b').querySelector<HTMLButtonElement>('.tl-mask-link')!;
    expect(back.getAttribute('aria-label')).toBe(`Masked by ${m.name}. Click to paint its mask.`);
  });

  it('the new mask follows what is remembered: paint where it hides', () => {
    mount();
    setChoice('effects.maskStart', 'hide');
    run('layers.addMask');
    expect(mask().mask).toBe('hide');
  });

  it('switches between the mask and its layer with one press, and by clicking the mark', () => {
    mount();
    run('layers.addMask');
    const m = mask();
    run('layers.maskSwitch');
    expect(store().get().ui.activeLayerId).toBe('b');
    run('layers.maskSwitch');
    expect(store().get().ui.activeLayerId).toBe(m.id);
    act(() => row('b').querySelector<HTMLButtonElement>('.tl-mask-link')!.click());
    expect(store().get().ui.activeLayerId).toBe(m.id);
    act(() => row(m.id).querySelector<HTMLButtonElement>('.tl-mask-link')!.click());
    expect(store().get().ui.activeLayerId).toBe('b');
  });

  it('turns off and on from the row, keeping the mask', () => {
    mount();
    run('layers.addMask');
    const m = mask();
    const sw = () => row(m.id).querySelector<HTMLButtonElement>('.tl-mask-switch')!;
    expect(sw().getAttribute('aria-pressed')).toBe('true');
    act(() => sw().click());
    expect(mask().visible).toBe(false);
    expect(mask().mask).toBe('show');
    expect(sw().classList.contains('is-off')).toBe(true);
    expect(sw().getAttribute('aria-label')).toBe('Turn mask on');
    run('layers.maskOnOff');
    expect(mask().visible).toBe(true);
  });

  it('flips, and takes the mask off for good as a plain layer that keeps its drawing', () => {
    mount();
    run('layers.addMask');
    const id = mask().id;
    run('layers.flipMask');
    expect(mask().mask).toBe('hide');
    run('layers.removeMask');
    expect(layers().find((l) => l.id === id)!.mask).toBeUndefined();
    expect(layers().some((l) => l.id === id)).toBe(true);
    expect(row(id).classList.contains('is-mask')).toBe(false);
  });

  it('the Layers panel has a Mask button that does the same', () => {
    mount();
    const btn = host.querySelector<HTMLButtonElement>('button[aria-label="Add a mask to this layer"]')!;
    expect(btn.disabled).toBe(false);
    act(() => btn.click());
    expect(mask().mask).toBe('show');
    // On a mask it has nothing to add one to, and says why.
    expect(btn.disabled).toBe(true);
    expect(btn.title).toMatch(/already/);
  });

  it('undo takes the whole mask back in one step', () => {
    mount();
    run('layers.addMask');
    act(() => void store().undo());
    expect(layers().map((l) => l.id)).toEqual(['a', 'b', 'top']);
    expect(layers().every((l) => !l.folder)).toBe(true);
  });
});

describe('a mask that leaves its folder', () => {
  const setup = () => {
    mount();
    run('layers.addMask');
    return mask().id;
  };

  it('stays a mask when that is the answer', () => {
    const id = setup();
    setChoice('effects.maskLeavesFolder', 'keep');
    act(() => void getCommand('layers.outOfFolder')!.run());
    const m = layers().find((l) => l.id === id)!;
    expect(m.folder).toBeUndefined();
    expect(m.mask).toBe('show');
  });

  it('becomes a plain layer when that is the answer, in its own undo step', () => {
    const id = setup();
    setChoice('effects.maskLeavesFolder', 'plain');
    act(() => void getCommand('layers.outOfFolder')!.run());
    const m = layers().find((l) => l.id === id)!;
    expect(m.folder).toBeUndefined();
    expect(m.mask).toBeUndefined();
    act(() => void store().undo());
    expect(layers().find((l) => l.id === id)!.mask).toBe('show');
    expect(layers().find((l) => l.id === id)!.folder).toBeUndefined();
  });
});
