// @vitest-environment jsdom
// The tile grid start handle only shows and grabs with Alt held, or while the "Where the tile grid starts" form is open,
// so a click at the stage corner paints.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/tiles';
import type { TilemapLayer } from '../../src/core/format';
import { getTool, type ToolContext, type ToolPointer } from '../../src/core/registry';
import { resetStore, store } from '../../src/core/store';
import { getTileUi, gridHandleOn, setTileUi } from '../../src/tiles/state';
import { getCell } from '../../src/tiles/model';
import { sampleTileDoc } from './helpers';

const ptr = (x: number, y: number, alt = false): ToolPointer => ({ x, y, pressure: 0.5, hasPressure: false, shift: false, alt, mod: false, button: 0, pointerType: 'mouse', time: 0 });
const ctx = (): ToolContext => ({ zoom: 4, requestOverlay: vi.fn(), hint: vi.fn() });
const grid = () => store().get().doc.tileset?.gridX ?? 0;

function setup() {
  const { doc, keys } = sampleTileDoc();
  resetStore(doc);
  const layer = store().get().doc.layers.find((l) => l.kind === 'tilemap') as TilemapLayer;
  store().setUi({ activeLayerId: layer.id });
  setTileUi({ brush: keys[2], flags: 0, sizeForm: false });
  return layer;
}
const click = (id: string, x: number, y: number, alt: boolean, c: ToolContext) => {
  const t = getTool(id)!;
  t.down!(ptr(x, y, alt), c);
  t.up!(ptr(x + 1, y + 1, alt), c);
};
const dragTo = (id: string, to: [number, number], alt: boolean, c: ToolContext) => {
  const t = getTool(id)!;
  t.down!(ptr(0, 0, alt), c);
  t.move!(ptr(to[0], to[1], alt), c);
  t.up!(ptr(to[0], to[1], alt), c);
};

describe('the grid handle', () => {
  beforeEach(() => setTileUi({ sizeForm: false }));

  it('is on only with Alt or the open form', () => {
    expect(gridHandleOn(false, false)).toBe(false);
    expect(gridHandleOn(true, false)).toBe(true);
    expect(gridHandleOn(false, true)).toBe(true);
  });

  it('a plain click at the stage corner paints and leaves the grid alone', () => {
    setup();
    const c = ctx();
    click('tile-brush', 1, 1, false, c);
    expect(grid()).toBe(0);
    const map = store().get().doc.drawings[(store().get().doc.layers.find((l) => l.kind === 'tilemap') as TilemapLayer).cels[0].drawingId];
    expect(map.kind === 'tilemap' && getCell(map, 0, 0)).toBeTruthy();
  });

  it('a plain drag from the corner does not move the grid', () => {
    setup();
    dragTo('tile-brush', [3, 2], false, ctx());
    expect(grid()).toBe(0);
  });

  it('with Alt held, dragging from the corner moves the grid', () => {
    setup();
    dragTo('tile-brush', [3, 2], true, ctx());
    expect(grid()).toBe(3);
  });

  it('with the form open, dragging from the corner moves the grid without Alt', () => {
    setup();
    setTileUi({ sizeForm: true });
    expect(getTileUi().sizeForm).toBe(true);
    dragTo('tile-rect', [4, 1], false, ctx());
    expect(grid()).toBe(4);
  });

  it('is drawn only with Alt held or the form open', () => {
    setup();
    const arcs = vi.fn();
    const g = new Proxy({}, { get: (_t, k) => (k === 'arc' ? arcs : () => {}), set: () => true }) as unknown as CanvasRenderingContext2D;
    const t = getTool('tile-brush')!;
    const c = ctx();
    t.overlay!(g, c);
    expect(arcs).not.toHaveBeenCalled();
    setTileUi({ sizeForm: true });
    t.overlay!(g, c);
    expect(arcs).toHaveBeenCalledTimes(1);
    setTileUi({ sizeForm: false });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt' }));
    t.overlay!(g, c);
    expect(arcs).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' }));
    t.overlay!(g, c);
    expect(arcs).toHaveBeenCalledTimes(2);
  });
});
