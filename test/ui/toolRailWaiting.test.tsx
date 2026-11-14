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
import { resetDock } from '../../src/ui/dock';
import { dockMenu } from '../../src/ui/dockMenus';
import { getPrefs, resetPrefs, setPrefs } from '../../src/ui/prefs';
import { waitingFor, waitingWords, type RailTool } from '../../src/ui/toolArrange';
import { ToolStrip } from '../../src/ui/ToolStrip';
import { frontTools, flyRequest, goToLayerFor, waitingMenu } from '../../src/ui/toolRail';

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

describe('the waiting button on the rail', () => {
  let host: HTMLElement;
  let root: Root;
  const doc = () => {
    const d = newDoc({ width: 100, height: 100 });
    const px = newPixelLayer('Pixels', 8);
    d.layers.push(px);
    return { d, vector: d.layers[0].id, pixel: px.id };
  };
  const chip = () => host.querySelector<HTMLButtonElement>('.ui-tools-waiting');

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

  it('on a pixel layer it counts Text, Gradient and the rest, and names them', () => {
    const k = doc();
    resetStore(k.d);
    act(() => store().setUi({ activeLayerId: k.pixel }));
    act(() => root.render(<ToolStrip />));
    expect(chip()).not.toBeNull();
    const tip = chip()!.getAttribute('data-tip-desc')!;
    expect(tip).toContain('Text');
    expect(tip).toContain('Gradient');
    expect(tip).toContain('work on vector layers');
    expect(Number(chip()!.textContent)).toBeGreaterThanOrEqual(2);
  });

  it('on a vector layer it names Shade, Dither and the rest', () => {
    const k = doc();
    resetStore(k.d);
    act(() => store().setUi({ activeLayerId: k.vector }));
    act(() => root.render(<ToolStrip />));
    expect(chip()!.getAttribute('data-tip-desc')).toContain('Shade');
    expect(chip()!.getAttribute('data-tip-desc')).toContain('work on pixel layers');
  });

  it('is not there when the tools are greyed out in place (they say why when pressed)', () => {
    const k = doc();
    resetStore(k.d);
    setPrefs({ toolsOffLayer: 'grey' });
    act(() => store().setUi({ activeLayerId: k.pixel }));
    act(() => root.render(<ToolStrip />));
    expect(chip()).toBeNull();
  });

  it('pressing it opens a list, and "greyed out instead" switches the preference', () => {
    const k = doc();
    resetStore(k.d);
    act(() => store().setUi({ activeLayerId: k.pixel }));
    act(() => root.render(<ToolStrip />));
    act(() => chip()!.click());
    const items = dockMenu.get()!.items;
    expect(items[0]).toEqual({ heading: 'Waiting for a vector layer' });
    const grey = items.find((i) => 'label' in i && i.label === 'Show them greyed out instead');
    act(() => {
      if (grey && 'onClick' in grey) grey.onClick();
    });
    expect(getPrefs().toolsOffLayer).toBe('grey');
    expect(chip()).toBeNull();
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

  it('the list has one line per tool, ending with the way to grey them out', () => {
    const items = waitingMenu([{ id: 'text', label: 'Text', needs: 'vector' }, { id: 'gradient', label: 'Gradient', needs: 'vector' }]);
    expect(items.filter((i) => 'label' in i).map((i) => ('label' in i ? i.label : ''))).toEqual(['Text: go to a vector layer', 'Gradient: go to a vector layer', 'Show them greyed out instead', 'Why are they not on the strip?']);
  });
});
