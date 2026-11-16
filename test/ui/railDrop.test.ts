// Dragging the tool rail by its grip: which target a point lands on, where the rail ends up (including a drag that ends
// nowhere), the side it comes home to, and that older saves still read.
import { describe, expect, it } from 'vitest';
import { emptyLayout, normaliseLayout, placeToolsIn, sanitizeWorkspace, toolsHome } from '../../src/ui/dockModel';
import { inRailEdge, railBands, railCorner, railDropAt, railDropNote, settleRail, RAIL_BAND, type RailGeometry } from '../../src/ui/railDrop';

// A 1280 x 800 window: a top bar of 40, a status bar of 24, the canvas in the middle with panels either side.
const g: RailGeometry = {
  body: { left: 0, top: 40, right: 1280, bottom: 776 },
  center: { left: 0, top: 40, right: 1280, bottom: 776 },
  canvas: { left: 340, top: 80, right: 940, bottom: 700 },
};

describe('which target a point lands on', () => {
  it('each outer edge of the work area docks on that side', () => {
    expect(railDropAt(10, 400, g)).toEqual({ dock: 'left' });
    expect(railDropAt(1270, 400, g)).toEqual({ dock: 'right' });
    expect(railDropAt(640, 50, g)).toEqual({ dock: 'top' });
    expect(railDropAt(640, 770, g)).toEqual({ dock: 'bottom' });
  });
  it('the left and right bands win the corners', () => {
    expect(railDropAt(10, 45, g)).toEqual({ dock: 'left' });
    expect(railDropAt(1270, 770, g)).toEqual({ dock: 'right' });
  });
  it('the canvas floats it', () => {
    expect(railDropAt(600, 300, g)).toEqual({ float: true });
  });
  it('the old home column is a target too, so a rail can go back where it was docked', () => {
    // The rail's own column sits in the left band whatever else is docked beside it.
    expect(railDropAt(RAIL_BAND - 1, 300, g)).toEqual({ dock: 'left' });
  });
  it('over panels, the bars or outside the window it is nowhere', () => {
    expect(railDropAt(200, 300, g)).toBeNull();
    expect(railDropAt(1000, 300, g)).toBeNull();
    expect(railDropAt(600, 10, g)).toBeNull();
    expect(railDropAt(-5, 300, g)).toBeNull();
    expect(railDropAt(2000, 2000, g)).toBeNull();
  });
  it('the bands never reach each other beyond the corners', () => {
    const b = railBands(g);
    expect(b.top.left).toBe(0);
    expect(b.left.right - b.left.left).toBe(RAIL_BAND);
    expect(b.top.bottom - b.top.top).toBeLessThan(RAIL_BAND);
  });
});

describe('where the rail ends up', () => {
  const docked = { place: 'right' as const, x: 90, y: 110 };
  const floating = { place: 'float' as const, x: 300, y: 220 };
  const at = { x: 500, y: 400 };
  it('a drop on a side docks there, whatever it was doing', () => {
    expect(settleRail(true, { dock: 'top' }, docked, at)).toEqual({ place: 'top' });
    expect(settleRail(true, { dock: 'left' }, floating, at)).toEqual({ place: 'left' });
  });
  it('a drop on the canvas floats it where it was let go', () => {
    expect(settleRail(true, { float: true }, docked, at)).toEqual({ place: 'float', at });
  });
  it('a drag that ends nowhere puts a docked rail back on its side, not floating', () => {
    expect(settleRail(true, null, docked, at)).toEqual({ place: 'right' });
  });
  it('a drag that ends nowhere puts a floating rail back where it was floating', () => {
    expect(settleRail(true, null, floating, at)).toEqual({ place: 'float', at: { x: 300, y: 220 } });
  });
  it('Escape puts it back even over a good target', () => {
    expect(settleRail(false, { dock: 'top' }, docked, at)).toEqual({ place: 'right' });
    expect(settleRail(false, { float: true }, floating, at)).toEqual({ place: 'float', at: { x: 300, y: 220 } });
  });
  it('keeps the grip under the pointer and on the screen', () => {
    expect(railCorner(100, 100, { x: 10, y: 6 }, { w: 1280, h: 800 })).toEqual({ x: 90, y: 94 });
    expect(railCorner(-50, 5000, { x: 10, y: 6 }, { w: 1280, h: 800 })).toEqual({ x: 0, y: 740 });
  });
});

describe('the side a floating rail comes home to', () => {
  it('is the side it was last docked on, and floating again leaves it alone', () => {
    let l = placeToolsIn(emptyLayout(), 'right');
    l = placeToolsIn(l, 'float', { x: 200, y: 200 });
    expect(l.tools.place).toBe('float');
    expect(toolsHome(l)).toBe('right');
    l = placeToolsIn(l, 'float', { x: 300, y: 250 });
    expect(toolsHome(l)).toBe('right');
    expect(placeToolsIn(l, toolsHome(l)).tools.place).toBe('right');
  });
  it('docking somewhere new changes it', () => {
    let l = placeToolsIn(emptyLayout(), 'bottom');
    l = placeToolsIn(l, 'float', { x: 1, y: 1 });
    l = placeToolsIn(l, 'top');
    l = placeToolsIn(l, 'float');
    expect(toolsHome(l)).toBe('top');
  });
  it('a rail that has only ever floated comes home to the left', () => {
    const l = normaliseLayout({ tools: { place: 'float', x: 5, y: 6 } });
    expect(l.tools.home).toBeUndefined();
    expect(toolsHome(l)).toBe('left');
  });
  it('is kept in a saved layout and a workspace file, and a bad value is dropped', () => {
    const l = placeToolsIn(placeToolsIn(emptyLayout(), 'right'), 'float', { x: 4, y: 5 });
    expect(normaliseLayout(JSON.parse(JSON.stringify(l))).tools.home).toBe('right');
    expect(sanitizeWorkspace({ id: 'u-1', name: 'x', layout: JSON.parse(JSON.stringify(l)) })!.layout.tools.home).toBe('right');
    expect(normaliseLayout({ tools: { place: 'float', home: 'float' } }).tools.home).toBeUndefined();
    expect(normaliseLayout({ tools: { place: 'left', home: '<script>' } }).tools.home).toBeUndefined();
  });
  it('a layout from before this opens as it did', () => {
    const old = { zones: {}, floats: [], tools: { place: 'top', x: 1, y: 2 }, hidden: [], known: [] };
    expect(normaliseLayout(old).tools).toEqual({ place: 'top', x: 1, y: 2 });
  });
});

describe('the grip and the width edge', () => {
  const rail = { left: 0, right: 94 };
  it('the inner few pixels of a docked rail are the width edge, not the grip', () => {
    expect(inRailEdge(92, rail, 'left')).toBe(true);
    expect(inRailEdge(40, rail, 'left')).toBe(false);
    expect(inRailEdge(1240, { left: 1186, right: 1280 }, 'right')).toBe(false);
    expect(inRailEdge(1188, { left: 1186, right: 1280 }, 'right')).toBe(true);
  });
  it('a rail on the top, bottom or floating has no width edge to keep clear of', () => {
    expect(inRailEdge(92, rail, 'top')).toBe(false);
    expect(inRailEdge(92, rail, 'float')).toBe(false);
  });
});

describe('the words by the pointer', () => {
  it('says what letting go does', () => {
    expect(railDropNote({ dock: 'left' }, 'left')).toBe('back on the left, as it was');
    expect(railDropNote({ dock: 'top' }, 'left')).toBe('dock on the top');
    expect(railDropNote({ float: true }, 'left')).toBe('float here');
    expect(railDropNote(null, 'left')).toBe('let go to put it back');
    expect(railDropNote({ dock: 'right' }, null)).toBe('dock on the right');
  });
});
