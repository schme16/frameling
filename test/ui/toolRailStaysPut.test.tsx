// @vitest-environment jsdom
// The tool rail keeps its shape from layer to layer: the same places for a vector layer and a pixel layer, what doesn't
// work greyed out (with the reason), the Lasso and the Pixel lasso sharing one place, and a saved arrangement still loading.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/core/commands';
import '../../src/tools';
import '../../src/pixel';
import { newDoc, newPixelLayer } from '../../src/core/doc';
import { allTools, getTool } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { toasts } from '../../src/ui/toast';
import { applyWorkspace, resetDock, setToolGroups } from '../../src/ui/dock';
import { resetPrefs, setPrefs } from '../../src/ui/prefs';
import { moveTool, railFor, resolveGroups, sanitizeGroups, shiftTool, slotMates, twinFor, visibleGroups, whyOff, type RailTool, type ToolGroup } from '../../src/ui/toolArrange';
import { ToolStrip } from '../../src/ui/ToolStrip';
import { currentGroups, flyRequest, frontTools, toolMenu } from '../../src/ui/toolRail';

vi.mock('../../src/ui/rightDock.css', () => ({}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};

beforeAll(async () => {
  await import('../../src/renderer/features');
});

const G = (id: string, tools: string[]): ToolGroup => ({ id, tools });
const T = (id: string, layers: RailTool['layers'], extra: Partial<RailTool> = {}): RailTool => ({ id, layers, ...extra });

// A small cast of tools: shared ones, one of each kind alone, a twin pair, and a tile tool.
const CAST: RailTool[] = [
  T('brush', ['vector', 'pixel'], { group: 'draw', groupAt: 0 }),
  T('shade', ['pixel'], { group: 'extras', groupAt: 0 }),
  T('text', ['vector'], { group: 'shapes', groupAt: 0 }),
  T('lasso', ['vector'], { group: 'select', groupAt: 0, slot: 'select.lasso' }),
  T('pixel-lasso', ['pixel'], { group: 'select', groupAt: 0, slot: 'select.lasso' }),
  T('tile-brush', ['tilemap'], { group: 'draw', groupAt: 5 }),
  T('hand', ['vector', 'pixel', 'tilemap', 'camera'], { group: 'view', groupAt: 0 }),
];

describe('railFor', () => {
  it('a vector layer and a pixel layer show the same places', () => {
    const slots = (kind: 'vector' | 'pixel') => railFor(CAST, kind).shown.map((id) => CAST.find((t) => t.id === id)!.slot ?? id).sort();
    expect(slots('vector')).toEqual(slots('pixel'));
    expect(slots('vector')).toEqual(['brush', 'hand', 'select.lasso', 'shade', 'text']);
  });

  it('what does not work on the layer is off, not gone', () => {
    expect(railFor(CAST, 'vector').off.sort()).toEqual(['shade']);
    expect(railFor(CAST, 'pixel').off.sort()).toEqual(['text']);
  });

  it('a twin pair is one button, and it is the one that works here', () => {
    expect(railFor(CAST, 'vector').shown).toContain('lasso');
    expect(railFor(CAST, 'vector').shown).not.toContain('pixel-lasso');
    expect(railFor(CAST, 'pixel').shown).toContain('pixel-lasso');
    expect(railFor(CAST, 'pixel').shown).not.toContain('lasso');
  });

  it('the same layer kind always gives the same answer', () => {
    expect(railFor(CAST, 'pixel')).toEqual(railFor([...CAST].reverse().sort((a, b) => CAST.indexOf(a) - CAST.indexOf(b)), 'pixel'));
  });

  it('tile and camera layers show only what works there, with nothing greyed', () => {
    const r = railFor(CAST, 'tilemap');
    expect(r.shown.sort()).toEqual(['hand', 'tile-brush']);
    expect(r.off).toEqual([]);
  });

  it('with no layer yet, every place shows once', () => {
    const r = railFor(CAST, null);
    expect(r.shown).toContain('lasso');
    expect(r.shown).not.toContain('pixel-lasso');
    expect(r.off).toEqual([]);
  });

  it('a workspace that narrows a kind shows just those tools there, and none of them greyed', () => {
    const r = railFor(CAST, 'pixel', ['brush', 'shade', 'pixel-lasso', 'text']);
    expect(r.shown.sort()).toEqual(['brush', 'pixel-lasso', 'shade']);
    expect(r.off).toEqual([]);
  });

  it('finds the twin that works on the other kind of layer', () => {
    expect(twinFor(CAST, 'lasso', 'pixel')).toBe('pixel-lasso');
    expect(twinFor(CAST, 'pixel-lasso', 'vector')).toBe('lasso');
    expect(twinFor(CAST, 'brush', 'pixel')).toBeNull();
    expect(twinFor(CAST, 'shade', 'vector')).toBeNull();
  });
});

describe('why a tool is off', () => {
  it('says what it works on, what you are on, and what to do', () => {
    const w = whyOff({ label: 'Shade', layers: ['pixel'] }, 'vector');
    expect(w).toBe("Shade works on pixel layers, and you're on a vector layer. Click a pixel layer, or add one with Pixel in the Layers header.");
    expect(whyOff({ label: 'Text', layers: ['vector'] }, 'pixel')).toContain('Text works on vector layers, and you\'re on a pixel layer.');
  });
  it('has no em dashes', () => {
    expect(whyOff({ label: 'Shade', layers: ['pixel'] }, 'vector')).not.toContain('—');
  });
});

describe('slots in the arrangement', () => {
  const mates = slotMates(CAST);

  it('twins sit side by side, in the place of whichever the arrangement puts first', () => {
    const saved = [G('draw', ['brush', 'pixel-lasso']), G('select', ['text', 'lasso']), G('view', ['hand'])];
    const g = resolveGroups(saved, CAST);
    expect(g.find((x) => x.tools.includes('pixel-lasso'))!.tools).toEqual(['brush', 'pixel-lasso', 'lasso', 'tile-brush']);
    expect(g.flatMap((x) => x.tools).sort()).toEqual(CAST.map((t) => t.id).sort());
  });

  it('with nothing saved the twins start together', () => {
    const g = resolveGroups(undefined, CAST);
    const sel = g.find((x) => x.id === 'select')!.tools;
    expect(Math.abs(sel.indexOf('lasso') - sel.indexOf('pixel-lasso'))).toBe(1);
  });

  it('every tool is still placed exactly once', () => {
    const g = resolveGroups([G('a', ['lasso', 'brush']), G('b', ['pixel-lasso'])], CAST);
    expect(g.flatMap((x) => x.tools).sort()).toEqual(CAST.map((t) => t.id).sort());
  });

  it('moving one of a twin pair takes the other with it', () => {
    const groups = [G('draw', ['brush', 'lasso', 'pixel-lasso']), G('view', ['hand'])];
    const next = moveTool(groups, 'pixel-lasso', { group: 'view', before: 'hand' }, mates);
    expect(next.find((x) => x.id === 'view')!.tools).toEqual(['lasso', 'pixel-lasso', 'hand']);
    expect(next.find((x) => x.id === 'draw')!.tools).toEqual(['brush']);
  });

  it('dropping before the second of a pair lands before the pair', () => {
    const groups = [G('draw', ['brush', 'shade']), G('select', ['text', 'lasso', 'pixel-lasso'])];
    const next = moveTool(groups, 'shade', { group: 'select', before: 'pixel-lasso' }, mates);
    expect(next.find((x) => x.id === 'select')!.tools).toEqual(['text', 'shade', 'lasso', 'pixel-lasso']);
  });

  it('dropping a pair on itself changes nothing', () => {
    const groups = [G('select', ['lasso', 'pixel-lasso'])];
    expect(moveTool(groups, 'lasso', { group: 'select', before: 'pixel-lasso' }, mates)).toBe(groups);
  });

  it('into a group of its own, the pair goes together', () => {
    const groups = [G('draw', ['brush', 'lasso', 'pixel-lasso'])];
    const next = moveTool(groups, 'lasso', { newGroupAt: 1 }, mates);
    expect(next.map((g) => g.tools)).toEqual([['brush'], ['lasso', 'pixel-lasso']]);
  });

  it('a keyboard step moves a pair as one', () => {
    const groups = [G('s', ['lasso', 'pixel-lasso', 'brush', 'text'])];
    const shown = (id: string) => id !== 'pixel-lasso';
    const next = shiftTool(groups, 'lasso', 1, shown, mates);
    expect(next[0].tools).toEqual(['brush', 'lasso', 'pixel-lasso', 'text']);
  });

  it('without slots a move is the plain move it always was', () => {
    const groups = [G('a', ['x', 'y']), G('b', ['z'])];
    expect(moveTool(groups, 'x', { group: 'b' }).map((g) => g.tools)).toEqual([['y'], ['z', 'x']]);
  });

  it('what shows for each layer has the same groups and order', () => {
    const groups = resolveGroups(undefined, CAST);
    const shape = (kind: 'vector' | 'pixel') => {
      const shown = new Set(railFor(CAST, kind).shown);
      return visibleGroups(groups, (id) => shown.has(id)).map((g) => g.tools.map((id) => CAST.find((t) => t.id === id)!.slot ?? id));
    };
    expect(shape('pixel')).toEqual(shape('vector'));
  });
});

describe('older saved arrangements', () => {
  it('one saved before slots (twins apart, the shape the app wrote) still loads and keeps your order', () => {
    const old = [
      { id: 'draw', tools: ['hand', 'brush'] },
      { id: 'select', tools: ['pixel-lasso', 'text'] },
      { id: 'g7', name: 'Mine', tools: ['lasso', 'shade'] },
    ];
    const clean = sanitizeGroups(old)!;
    expect(clean).toEqual(old);
    const g = resolveGroups(clean, CAST);
    expect(g.map((x) => x.id).slice(0, 3)).toEqual(['draw', 'select', 'g7']);
    expect(g[0].tools).toEqual(['hand', 'brush', 'tile-brush']);
    expect(g[1].tools).toEqual(['pixel-lasso', 'lasso', 'text']);
    expect(g[2].name).toBe('Mine');
    expect(g[2].tools).toEqual(['shade']);
  });

  it('is saved in the same shape as before (groups of tool ids, nothing new)', () => {
    const g = resolveGroups(undefined, CAST);
    expect(JSON.parse(JSON.stringify(g))).toEqual(g);
    for (const x of g) expect(Object.keys(x).sort()).toEqual(expect.arrayContaining(['id', 'tools']));
    expect(sanitizeGroups(g)).toEqual(g);
  });
});

describe('the real tools', () => {
  beforeEach(() => {
    resetDock();
    resetStore(newDoc());
  });
  const everyday = () => allTools() as RailTool[];

  it('the ways of selecting share a place between the vector and the pixel layer', () => {
    for (const mode of ['box', 'lasso', 'polygon', 'magnetic']) {
      const slot = everyday().filter((t) => t.slot === `select.${mode}`);
      expect(slot.length, mode).toBe(2);
    }
    // The magic wand has no vector twin, so it keeps its own place and is greyed on a vector layer.
    expect(getTool('pixel-select-wand')!.layers).toEqual(['pixel']);
    expect(everyday().filter((t) => t.slot === 'select.wand').length).toBe(1);
  });

  it('a vector layer and a pixel layer give the same rail, in every built-in workspace', () => {
    for (const ws of ['draw', 'animate', 'pixel']) {
      applyWorkspace(ws);
      const groups = currentGroups();
      const shape = (kind: 'vector' | 'pixel') => {
        // The Pixel workspace narrows a pixel layer on purpose; the others do not.
        const shown = new Set(railFor(everyday(), kind).shown);
        return visibleGroups(groups, (id) => shown.has(id)).map((g) => g.tools.map((id) => (getTool(id) as RailTool).slot ?? id));
      };
      expect(shape('pixel'), ws).toEqual(shape('vector'));
    }
  });

  it('shade, dither, spray and the wand are off on a vector layer, and text and the gradient on a pixel layer', () => {
    const v = railFor(everyday(), 'vector').off;
    for (const id of ['shade', 'dither', 'spray', 'pixel-select-wand']) expect(v, id).toContain(id);
    const p = railFor(everyday(), 'pixel').off;
    for (const id of ['text', 'gradient']) expect(p, id).toContain(id);
    expect(v).not.toContain('brush');
    expect(p).not.toContain('brush');
  });

  it('tile tools stay out of the vector and pixel rail', () => {
    const v = railFor(everyday(), 'vector').shown;
    expect(v.filter((id) => id.startsWith('tile-'))).toEqual([]);
    expect(railFor(everyday(), 'tilemap').shown.some((id) => id.startsWith('tile-'))).toBe(true);
  });

  it('every real tool is placed once, and each twin sits next to its twin', () => {
    const g = currentGroups();
    const flat = g.flatMap((x) => x.tools);
    expect(new Set(flat).size).toBe(flat.length);
    expect(flat.sort()).toEqual(allTools().map((t) => t.id).sort());
    for (const x of g) {
      const i = x.tools.indexOf('select-lasso');
      if (i >= 0) expect(x.tools[i + 1] === 'pixel-select-lasso' || x.tools[i - 1] === 'pixel-select-lasso').toBe(true);
    }
  });

  it('an arrangement of your own, saved before this, loads and keeps its order', () => {
    setToolGroups([G('mine', ['pencil', 'brush']), G('rest', ['pixel-select-lasso', 'select-lasso', 'hand'])]);
    const g = currentGroups();
    expect(g.find((x) => x.id === 'mine')!.tools).toEqual(['pencil', 'brush']);
    const rest = g.find((x) => x.id === 'rest')!.tools;
    expect(rest.slice(0, 2)).toEqual(['pixel-select-lasso', 'select-lasso']);
    expect(rest).toContain('hand');
    expect(g.flatMap((x) => x.tools).sort()).toEqual(allTools().map((t) => t.id).sort());
  });

  it('the move menu is the same for a twin pair', () => {
    const labels = toolMenu('select-lasso', () => true).map((i) => ('label' in i ? i.label : ''));
    expect(labels.some((l) => l?.startsWith('Move to'))).toBe(true);
  });
});

describe('the rail on the page', () => {
  let host: HTMLDivElement;
  let root: Root;
  const kindsDoc = () => {
    const doc = newDoc({ width: 100, height: 100 });
    const px = newPixelLayer('Pixels', 8);
    doc.layers.push(px);
    return { doc, vector: doc.layers[0].id, pixel: px.id };
  };
  const mount = () => act(() => root.render(<ToolStrip />));
  const ids = () => [...host.querySelectorAll('button.ui-tool')].map((b) => (b as HTMLElement).dataset.toolId!);
  const slotOf = (id: string) => (getTool(id) as RailTool | undefined)?.slot ?? id;
  const on = (id: string | null) => act(() => store().setUi({ activeLayerId: id }));

  beforeEach(() => {
    resetDock();
    resetPrefs();
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

  it('changing layer changes no place, and the lasso becomes the pixel lasso', () => {
    const k = kindsDoc();
    resetStore(k.doc);
    on(k.vector);
    act(() => store().setUi({ tool: 'select-lasso' }));
    mount();
    const vector = ids().map(slotOf);
    expect(host.querySelector('[data-tool-id="select-lasso"]')).toBeTruthy();
    on(k.pixel);
    expect(ids().map(slotOf)).toEqual(vector);
    expect(host.querySelector('[data-tool-id="select-lasso"]')).toBeNull();
    expect(host.querySelector('[data-tool-id="pixel-select-lasso"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(store().get().ui.tool).toBe('pixel-select-lasso');
    on(k.vector);
    expect(ids().map(slotOf)).toEqual(vector);
    expect(store().get().ui.tool).toBe('select-lasso');
  });

  it('a tool that does not work here is greyed, says why on hover, and explains when pressed', () => {
    const k = kindsDoc();
    resetStore(k.doc);
    on(k.vector);
    mount();
    const shade = host.querySelector<HTMLButtonElement>('[data-tool-id="shade"]')!;
    expect(shade.classList.contains('is-off')).toBe(true);
    expect(shade.getAttribute('aria-disabled')).toBe('true');
    expect(shade.getAttribute('data-tip-desc')).toContain('Shade works on pixel layers');
    act(() => shade.click());
    expect(store().get().ui.tool).not.toBe('shade');
    expect(toasts.get().some((t) => t.message.includes('Shade works on pixel layers'))).toBe(true);
    on(k.pixel);
    expect(host.querySelector('[data-tool-id="shade"]')!.classList.contains('is-off')).toBe(false);
    expect(host.querySelector('[data-tool-id="text"]')!.classList.contains('is-off')).toBe(true);
  });

  it('a shared tool that is not a twin keeps its place and stays picked', () => {
    const k = kindsDoc();
    resetStore(k.doc);
    on(k.vector);
    act(() => store().setUi({ tool: 'brush' }));
    mount();
    on(k.pixel);
    expect(store().get().ui.tool).toBe('brush');
  });

  it('the stacked style keeps its buttons too', () => {
    const k = kindsDoc();
    resetStore(k.doc);
    on(k.vector);
    act(() => setPrefs({ toolRail: 'stacked' }));
    mount();
    const buttons = () => [...host.querySelectorAll('button.ui-tool')].map((b) => (b as HTMLElement).dataset.toolGroup);
    const vector = buttons();
    on(k.pixel);
    expect(buttons()).toEqual(vector);
  });
});
