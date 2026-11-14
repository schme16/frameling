// @vitest-environment jsdom
// When a tool is left off the rail because of the layer you are on, the rail says so: a small button with how many are
// waiting, what they are, and a way to get to a layer they work on. Greyed-out tools already say why when pressed.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import '../../src/pixel';
import { newDoc, newPixelLayer } from '../../src/core/doc';
import { getTool } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { toasts } from '../../src/ui/toast';
import '../../src/ui/ChoiceDialog';
import { resetChoices, rememberedChoice, setChoice, setChoiceAsker } from '../../src/core/choices';
import { OFF_LAYER_CHOICE } from '../../src/ui/drawingMode';
import { applyWorkspace, resetDock } from '../../src/ui/dock';
import { dockMenu } from '../../src/ui/dockMenus';
import { getPrefs, resetPrefs, setPrefs } from '../../src/ui/prefs';
import { waitingFor, waitingWords, type RailTool } from '../../src/ui/toolArrange';
import { ToolStrip } from '../../src/ui/ToolStrip';
import { frontTools, flyRequest, goToLayerFor } from '../../src/ui/toolRail';

vi.mock('../../src/ui/rightDock.css', () => ({}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};

beforeAll(async () => {
  await import('../../src/renderer/features');
});

const T = (id: string, layers: RailTool['layers'], extra: Partial<RailTool> = {}): RailTool => ({ id, layers, label: id[0].toUpperCase() + id.slice(1), ...extra });
const CAST: RailTool[] = [
  T('brush', ['vector', 'pixel']),
  T('shade', ['pixel']),
  T('dither', ['pixel']),
  T('text', ['vector']),
  T('gradient', ['vector']),
  T('lasso', ['vector'], { slot: 'lasso' }),
  T('pixel-lasso', ['pixel'], { slot: 'lasso' }),
  T('tile-brush', ['tilemap']),
];

describe('waitingFor', () => {
  it('lists what the other kind of layer has, and nothing that has a twin here', () => {
    expect(waitingFor(CAST, 'pixel').map((t) => t.id)).toEqual(['text', 'gradient']);
    expect(waitingFor(CAST, 'vector').map((t) => t.id)).toEqual(['shade', 'dither']);
  });

  it('says which kind of layer each one needs', () => {
    expect(waitingFor(CAST, 'pixel').every((t) => t.needs === 'vector')).toBe(true);
    expect(waitingFor(CAST, 'vector').every((t) => t.needs === 'pixel')).toBe(true);
  });

  it('leaves out tools put away on purpose, and says nothing on tile or camera layers or with no layer', () => {
    expect(waitingFor(CAST, 'pixel', new Set(['gradient'])).map((t) => t.id)).toEqual(['text']);
    expect(waitingFor(CAST, 'tilemap')).toEqual([]);
    expect(waitingFor(CAST, 'camera')).toEqual([]);
    expect(waitingFor(CAST, null)).toEqual([]);
  });

  it('says it in plain words, one or many', () => {
    expect(waitingWords(waitingFor(CAST, 'pixel'))).toBe('Text and Gradient work on vector layers.');
    expect(waitingWords(waitingFor(CAST, 'pixel').slice(0, 1))).toBe('Text works on vector layers.');
    expect(waitingWords(waitingFor([...CAST, T('points', ['vector'])], 'pixel'))).toBe('Text, Gradient and Points work on vector layers.');
    expect(waitingWords([])).toBe('');
  });
});

describe('the layer line on the rail', () => {
  let host: HTMLElement;
  let root: Root;
  const doc = () => {
    const d = newDoc({ width: 100, height: 100 });
    const px = newPixelLayer('Pixels', 8);
    d.layers.push(px);
    return { d, vector: d.layers[0].id, pixel: px.id };
  };
  const line = () => host.querySelector<HTMLElement>('.ui-tool-switch');
  // The lit side of the switch carries the layer's tip, the other side says where it would go.
  const lit = () => host.querySelector<HTMLButtonElement>('.ui-tool-side.is-on');

  beforeEach(() => {
    resetDock();
    resetPrefs();
    frontTools.set({});
    flyRequest.set(null);
    toasts.set([]);
    dockMenu.set(null);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('on a pixel layer it says Pixel layer, counts Edit points and the rest, and names them', () => {
    const k = doc();
    resetStore(k.d);
    act(() => store().setUi({ activeLayerId: k.pixel }));
    act(() => root.render(<ToolStrip />));
    expect(line()).not.toBeNull();
    expect(lit()!.textContent).toBe('Pixels');
    expect(line()!.classList.contains('is-off')).toBe(true);
    const tip = lit()!.getAttribute('data-tip-desc')!;
    expect(tip).toContain('Edit points');
    expect(tip).toContain('need a vector layer');
    expect(tip).toContain('Press Vectors to go to one.');
  });

  it('on a vector layer it says Vector layer and names Shade, Dither and the rest', () => {
    const k = doc();
    resetStore(k.d);
    act(() => store().setUi({ activeLayerId: k.vector }));
    act(() => root.render(<ToolStrip />));
    expect(lit()!.textContent).toBe('Vectors');
    expect(line()!.textContent).not.toMatch(/tools off/);
    expect(lit()!.getAttribute('data-tip')).toMatch(/\d+ tools off/);
    expect(lit()!.getAttribute('data-tip-desc')).toContain('Shade');
    expect(lit()!.getAttribute('data-tip-desc')).toContain('need a pixel layer');
  });

  it('turns gold only when the Pixel workspace is on a layer that is not pixel', () => {
    const k = doc();
    resetStore(k.d);
    act(() => store().setUi({ activeLayerId: k.vector }));
    act(() => root.render(<ToolStrip />));
    // The Draw workspace on a vector layer: tools are off, which is ordinary, so no alarm.
    expect(line()!.classList.contains('is-off')).toBe(true);
    expect(line()!.classList.contains('is-alert')).toBe(false);
    act(() => void applyWorkspace('pixel'));
    expect(line()!.classList.contains('is-alert')).toBe(true);
    expect(host.querySelector('.ui-tool-head.is-alert .ui-tool-head-off')).not.toBeNull();
    act(() => store().setUi({ activeLayerId: k.pixel }));
    expect(line()!.classList.contains('is-alert')).toBe(false);
  });

  it('follows the layer you pick, and the groups that lost tools say how many', () => {
    const k = doc();
    resetStore(k.d);
    act(() => store().setUi({ activeLayerId: k.vector }));
    act(() => root.render(<ToolStrip />));
    expect(host.querySelector('.ui-tool-head-off')?.textContent).toMatch(/^\d+ off$/);
    act(() => store().setUi({ activeLayerId: k.pixel }));
    expect(lit()!.textContent).toBe('Pixels');
  });

  it('with the tools greyed out it still names the layer, and counts the greyed ones without turning gold', () => {
    const k = doc();
    resetStore(k.d);
    setPrefs({ toolsOffLayer: 'grey' });
    act(() => store().setUi({ activeLayerId: k.vector }));
    act(() => root.render(<ToolStrip />));
    expect(lit()!.textContent).toBe('Vectors');
    expect(line()!.textContent).not.toMatch(/greyed out/);
    expect(lit()!.getAttribute('data-tip')).toMatch(/\d+ tools? greyed out/);
    expect(line()!.classList.contains('is-off')).toBe(false);
    expect(host.querySelector('.ui-tool-head-off')).toBeNull();
  });

  it('right-clicking it opens the way back first, and "grey them out" switches the preference', () => {
    const k = doc();
    resetStore(k.d);
    act(() => store().setUi({ activeLayerId: k.vector }));
    act(() => root.render(<ToolStrip />));
    act(() => void line()!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    const items = dockMenu.get()!.items;
    expect(items[0]).toEqual({ heading: 'Vector layer: Layer 1' });
    const go = items.find((i) => 'label' in i && i.label.startsWith('Go to the pixel layer'));
    expect(go && 'label' in go && go.label).toBe('Go to the pixel layer "Pixels"');
    act(() => {
      if (go && 'onClick' in go) go.onClick();
    });
    expect(store().get().ui.activeLayerId).toBe(k.pixel);
    const grey = items.find((i) => 'label' in i && i.label.startsWith('Grey them out'));
    act(() => {
      if (grey && 'onClick' in grey) grey.onClick();
    });
    expect(getPrefs().toolsOffLayer).toBe('grey');
  });

  it('the first time tools leave the rail it says so in a toast with Change, and does not say it again', () => {
    vi.useFakeTimers();
    try {
      resetChoices();
      setChoiceAsker(async () => null);
      const k = doc();
      resetStore(k.d);
      act(() => store().setUi({ activeLayerId: k.vector }));
      act(() => root.render(<ToolStrip />));
      expect(toasts.get().length).toBe(0);
      act(() => void vi.advanceTimersByTime(800));
      const t = toasts.get().find((x) => /hidden/.test(x.message));
      expect(t?.message).toContain('Tools that do not work on this layer are hidden');
      expect(t?.action?.label).toBe('Change');
      expect(rememberedChoice(OFF_LAYER_CHOICE)).toBe('hide');
      // Back and forth between layers: nothing more is said.
      toasts.set([]);
      act(() => store().setUi({ activeLayerId: k.pixel }));
      act(() => store().setUi({ activeLayerId: k.vector }));
      act(() => void vi.advanceTimersByTime(800));
      expect(toasts.get().length).toBe(0);
    } finally {
      setChoiceAsker(null);
      setChoice(OFF_LAYER_CHOICE, undefined);
      vi.useRealTimers();
    }
  });

  it('offers to add a pixel layer when there is none', () => {
    const d = newDoc({ width: 100, height: 100 });
    resetStore(d);
    act(() => store().setUi({ activeLayerId: d.layers[0].id }));
    act(() => root.render(<ToolStrip />));
    act(() => void line()!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
    expect(dockMenu.get()!.items.some((i) => 'label' in i && i.label === 'Add a pixel layer')).toBe(true);
  });
});

describe('the Pixels | Vectors switch on the rail', () => {
  let host: HTMLElement;
  let root: Root;
  const make = () => {
    const d = newDoc({ width: 100, height: 100 });
    const px = newPixelLayer('Pixels', 8);
    d.layers.push(px);
    return { d, vector: d.layers[0].id, pixel: px.id };
  };
  const side = (which: 'pixel' | 'vector') => host.querySelector<HTMLButtonElement>(`.ui-tool-side.is-${which}`)!;
  const mount = (activeLayerId: string, d = store().get().doc) => {
    resetStore(d);
    act(() => store().setUi({ activeLayerId }));
    act(() => root.render(<ToolStrip />));
  };

  beforeEach(() => {
    resetDock();
    resetPrefs();
    resetChoices();
    setChoiceAsker(null);
    frontTools.set({});
    flyRequest.set(null);
    toasts.set([]);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('has Pixels on the left and Vectors on the right, and lights the side of the layer you are on', () => {
    const k = make();
    mount(k.vector, k.d);
    const words = [...host.querySelectorAll('.ui-tool-side-word')].map((b) => b.textContent);
    expect(words).toEqual(['Pixels', 'Vectors']);
    expect(side('vector').getAttribute('aria-pressed')).toBe('true');
    expect(side('pixel').getAttribute('aria-pressed')).toBe('false');
    act(() => store().setUi({ activeLayerId: k.pixel }));
    expect(side('pixel').getAttribute('aria-pressed')).toBe('true');
    expect(side('vector').getAttribute('aria-pressed')).toBe('false');
  });

  it('pressing the other side goes to the top layer of that kind', () => {
    const k = make();
    mount(k.vector, k.d);
    act(() => side('pixel').click());
    expect(store().get().ui.activeLayerId).toBe(k.pixel);
    expect(side('pixel').classList.contains('is-on')).toBe(true);
    act(() => side('vector').click());
    expect(store().get().ui.activeLayerId).toBe(k.vector);
  });

  it('pressing the side you are on does nothing', () => {
    const k = make();
    mount(k.vector, k.d);
    act(() => side('vector').click());
    expect(store().get().ui.activeLayerId).toBe(k.vector);
    expect(toasts.get().length).toBe(0);
  });

  it('with no layer of that kind it makes one, and the switch follows', () => {
    const d = newDoc({ width: 100, height: 100 });
    mount(d.layers[0].id, d);
    act(() => side('pixel').click());
    expect(store().get().doc.layers.some((l) => l.kind === 'pixel')).toBe(true);
    expect(side('pixel').classList.contains('is-on')).toBe(true);
  });

  it('a one-way tool picked from the wrong kind of layer flips the switch instead of being refused', () => {
    const k = make();
    mount(k.vector, k.d);
    act(() => store().setUi({ tool: 'shade' }));
    expect(store().get().ui.tool).toBe('shade');
    expect(store().get().ui.activeLayerId).toBe(k.pixel);
    expect(side('pixel').classList.contains('is-on')).toBe(true);
    act(() => store().setUi({ tool: 'points' }));
    expect(store().get().ui.tool).toBe('points');
    expect(store().get().ui.activeLayerId).toBe(k.vector);
    expect(side('vector').classList.contains('is-on')).toBe(true);
  });

  it('with the tools greyed out, pressing a greyed one flips the switch and picks it', () => {
    setPrefs({ toolsOffLayer: 'grey' });
    const k = make();
    mount(k.vector, k.d);
    act(() => host.querySelector<HTMLButtonElement>('[data-tool-id="shade"]')!.click());
    expect(store().get().ui.tool).toBe('shade');
    expect(side('pixel').classList.contains('is-on')).toBe(true);
  });

  it('a tool that works on both leaves the switch alone', () => {
    const k = make();
    mount(k.vector, k.d);
    act(() => store().setUi({ tool: 'brush' }));
    expect(store().get().ui.activeLayerId).toBe(k.vector);
    act(() => store().setUi({ tool: 'pencil' }));
    expect(store().get().ui.activeLayerId).toBe(k.vector);
  });

  it('the Lasso becomes the Pixel lasso on a pixel layer rather than flipping the switch', () => {
    const k = make();
    mount(k.pixel, k.d);
    act(() => store().setUi({ tool: 'select-lasso' }));
    expect(store().get().ui.tool).toBe('pixel-select-lasso');
    expect(store().get().ui.activeLayerId).toBe(k.pixel);
  });

  it('pressing a side while holding a one-way tool moves to a tool that works there, and stays put', () => {
    const k = make();
    mount(k.pixel, k.d);
    act(() => store().setUi({ tool: 'shade' }));
    act(() => side('vector').click());
    expect(store().get().ui.activeLayerId).toBe(k.vector);
    expect(store().get().ui.tool).not.toBe('shade');
    expect(side('vector').classList.contains('is-on')).toBe(true);
  });

  it('with no layer for a one-way tool, makes one when nothing asks, and leaves the tool picked', () => {
    const d = newDoc({ width: 100, height: 100 });
    mount(d.layers[0].id, d);
    act(() => store().setUi({ tool: 'shade' }));
    expect(store().get().ui.tool).toBe('shade');
    expect(store().get().doc.layers.some((l) => l.kind === 'pixel')).toBe(true);
  });

  it('the count of tools that are off sits on the side they are on, in the icons-only form', () => {
    const k = make();
    mount(k.vector, k.d);
    expect(host.querySelector('.ui-tool-side.is-pixel .ui-tool-layer-count')).not.toBeNull();
    expect(host.querySelector('.ui-tool-side.is-vector .ui-tool-layer-count')).toBeNull();
  });
});

describe('getting to a layer the tool works on', () => {
  beforeEach(() => {
    resetDock();
    resetPrefs();
    toasts.set([]);
  });

  it('goes to the top layer of that kind and picks the tool', () => {
    const d = newDoc({ width: 100, height: 100 });
    const px = newPixelLayer('Pixels', 8);
    d.layers.push(px);
    resetStore(d);
    store().setUi({ activeLayerId: px.id });
    expect(getTool('text')).toBeTruthy();
    goToLayerFor({ id: 'text', label: 'Text', needs: 'vector' });
    expect(store().get().ui.activeLayerId).toBe(d.layers[0].id);
    expect(store().get().ui.tool).toBe('text');
  });

  it('with no such layer, says why and what to do instead', () => {
    const d = newDoc({ width: 100, height: 100 });
    resetStore(d);
    store().setUi({ tool: 'brush' });
    goToLayerFor({ id: 'shade', label: 'Shade', needs: 'pixel' });
    expect(toasts.get().some((t) => /Shade works on pixel layers/.test(t.message))).toBe(true);
    expect(store().get().ui.tool).toBe('brush');
  });
});
