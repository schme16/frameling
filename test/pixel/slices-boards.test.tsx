// @vitest-environment jsdom
// Slices on every board and layer: the panel lists them grouped, edits reach a board that is not open, the tool picks a
// slice on a layer that is not the active one, and the Slices panel is near the front of the Pixel workspace.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import '../../src/pixel';
import { addArtboard, artboardsOf, ensureArtboards } from '../../src/artboards/model';
import { newDoc, newPixelLayer } from '../../src/core/doc';
import type { Doc, PixelLayer } from '../../src/core/format';
import { getTool, type ToolContext, type ToolPointer } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { sliceOwners, findSlice } from '../../src/pixel/slices/model';
import { SlicesPanel } from '../../src/pixel/slices/SlicesPanel';
import { createSlice, deleteSlice, editSlice, keySliceHere, pickSlice, renameSlice, sliceExists } from '../../src/pixel/slices/state';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ctx: ToolContext = { zoom: 8, requestOverlay: () => {}, hint: () => {} };
const at = (x: number, y: number): ToolPointer => ({ x, y, pressure: 0.5, hasPressure: false, shift: false, alt: false, mod: false, button: 0, pointerType: 'mouse', time: 0 });

let host: HTMLElement | null = null;
let root: Root | null = null;

/** A document with two layers on the open board, a slice on each, and a second board with a slice. */
function setup(): { walk: string } {
  const d = newDoc({ name: 'p', width: 64, height: 48, length: 6, pixel: { pixelSize: 1 } });
  const top = newPixelLayer('Top', 1);
  top.slices = [{ id: 'sl-top', name: 'hat', x: 30, y: 30, w: 10, h: 10 }];
  (d.layers[0] as PixelLayer).slices = [{ id: 'sl-base', name: 'body', x: 2, y: 2, w: 8, h: 8 }];
  d.layers.push(top);
  let walk = '';
  resetStore(d);
  store().update('boards', (doc) => {
    ensureArtboards(doc as Doc);
    walk = addArtboard(doc as Doc, { name: 'Walk' });
    const b = artboardsOf(doc as Doc).find((a) => a.id === walk)!;
    (b.content!.layers[0] as PixelLayer).slices = [{ id: 'sl-walk', name: 'foot', x: 4, y: 5, w: 6, h: 3 }];
  });
  return { walk };
}

beforeEach(() => {
  pickSlice(null);
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  host = root = null;
});

describe('finding slices on every board', () => {
  it('lists layers with slices, the open board first and the active layer first', () => {
    setup();
    const doc = store().get().doc;
    const owners = sliceOwners(doc, doc.layers[0].id);
    expect(owners.map((o) => [o.boardName, o.layer.name, o.open])).toEqual([
      ['Artboard 1', 'Layer 1', true],
      ['Artboard 1', 'Top', true],
      ['Walk', 'Layer 1', false],
    ]);
    expect(findSlice(doc, 'sl-walk')).toMatchObject({ open: false });
    expect(findSlice(doc, 'sl-top')).toMatchObject({ open: true });
    expect(findSlice(doc, 'nope')).toBeNull();
  });
});

describe('editing a slice on a board that is not open', () => {
  it('renames, moves and deletes it as undo steps', () => {
    const { walk } = setup();
    const foot = () => artboardsOf(store().get().doc).find((a) => a.id === walk)!.content!.layers[0] as PixelLayer;
    expect(sliceExists('sl-walk')).toBe(true);
    renameSlice('sl-walk', 'heel');
    expect(foot().slices![0].name).toBe('heel');
    editSlice('Move slice', 'sl-walk', (s) => void (s.x += 3));
    expect(foot().slices![0].x).toBe(7);
    store().undo();
    expect(foot().slices![0].x).toBe(4);
    deleteSlice('sl-walk');
    expect(foot().slices).toBeUndefined();
    store().undo();
    expect(foot().slices).toHaveLength(1);
  });

  it('keys can only be set on the open board', () => {
    setup();
    expect(keySliceHere('sl-walk')).toBe(false);
    expect(keySliceHere('sl-top')).toBe(true);
  });
});

describe('the Slice tool', () => {
  it('picks and moves a slice that is on a layer that is not the active one', () => {
    setup();
    // The active layer is the first (bottom) one; the hat is on Top.
    store().setUi({ activeLayerId: store().get().doc.layers[0].id });
    const tool = getTool('slice')!;
    tool.down!(at(35, 35), ctx);
    tool.move!(at(40, 35), ctx);
    tool.up!(at(40, 35), ctx);
    const top = store().get().doc.layers[1] as PixelLayer;
    expect(top.slices![0].x).toBe(35);
    expect((store().get().doc.layers[0] as PixelLayer).slices![0].x).toBe(2);
  });
});

describe('the Slices panel across boards', () => {
  const mount = () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(<SlicesPanel />));
  };

  it('groups by board and layer, with the active layer first', () => {
    setup();
    store().setUi({ activeLayerId: store().get().doc.layers[1].id });
    mount();
    const heads = [...host!.querySelectorAll('.sl-group-head b')].map((b) => b.textContent);
    expect(heads).toEqual(['Artboard 1 / Top', 'Artboard 1 / Layer 1', 'Walk / Layer 1']);
    expect(host!.querySelector('.sl-group-note')?.textContent).toBe('this layer');
    expect([...host!.querySelectorAll('.sl-pick b')].map((b) => b.textContent)).toEqual(['hat', 'body', 'foot']);
  });

  it('opens a slice of another board for editing, without key buttons, and Open board is offered', () => {
    setup();
    mount();
    act(() => pickSlice('sl-walk'));
    expect(host!.querySelector('input[aria-label="Slice name"]')).not.toBeNull();
    expect(host!.textContent).not.toMatch(/Move between frames/);
    expect(host!.querySelector('.sl-open')?.textContent).toBe('Open board');
    expect(host!.textContent).toMatch(/first frame/);
  });

  it('a layer with slices alone shows the plain list as before', () => {
    resetStore(newDoc({ name: 'p', width: 64, height: 48, pixel: { pixelSize: 1 } }));
    createSlice({ x: 1, y: 1, w: 4, h: 4 }, 'only');
    mount();
    expect(host!.querySelector('.sl-group-head')).toBeNull();
    expect(host!.querySelector('.sl-pick b')?.textContent).toBe('only');
  });

  it('with the active layer empty, slices elsewhere are still listed', () => {
    setup();
    store().update('add', (d) => void d.layers.push(newPixelLayer('Empty', 1)));
    store().setUi({ activeLayerId: store().get().doc.layers[2].id });
    mount();
    expect(host!.textContent).toMatch(/No slices on Empty yet/);
    expect([...host!.querySelectorAll('.sl-pick b')].map((b) => b.textContent)).toEqual(['hat', 'body', 'foot']);
  });
});

describe('the Pixel workspace', () => {
  it('has the Slices panel as a tab near the front of the right side', async () => {
    await import('../../src/renderer/features');
    const { builtinWorkspaces } = await import('../../src/ui/dock');
    const pixel = builtinWorkspaces().find((w) => w.id === 'pixel')!;
    const tabs = pixel.layout.zones.right.tabs;
    expect(tabs.indexOf('slices')).toBeGreaterThan(-1);
    expect(tabs.indexOf('slices')).toBeLessThanOrEqual(2);
    expect(pixel.layout.hidden).not.toContain('slices');
  });
});
