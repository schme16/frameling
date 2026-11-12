// The dock's pure model: tidying saved layouts (including ones from before the top zone and floating windows) and
// moving panels between zones and windows.
import { describe, expect, it } from 'vitest';
import {
  clampBox,
  closeFloat,
  closePanel,
  dockAllFloats,
  dockFloat,
  emptyLayout,
  floatTitle,
  frontPanel,
  locate,
  moveGroupTo,
  movePanelTo,
  normaliseLayout,
  placeToolsIn,
  placedIds,
  raiseFloat,
  renameFloatIn,
  renamePanelIn,
  sanitizeWorkspace,
  sanitizeWorkspaces,
  setFloatBox,
  type DockZone,
  type Layout,
} from '../../src/ui/dockModel';

const home = (id: string): DockZone => (id === 'timeline' ? 'bottom' : id === 'layers' ? 'left' : 'right');

/** A layout with a few panels in place. */
function sample(): Layout {
  const l = emptyLayout();
  l.zones.left = { tabs: ['layers'], active: 'layers', size: 260, collapsed: false };
  l.zones.right = { tabs: ['colours', 'library', 'help'], active: 'colours', size: 316, collapsed: false };
  l.zones.bottom = { tabs: ['timeline'], active: 'timeline', size: 230, collapsed: false };
  l.known = ['layers', 'colours', 'library', 'help', 'timeline'];
  return l;
}
const tabs = (l: Layout, z: DockZone) => l.zones[z].tabs;

describe('normaliseLayout', () => {
  it('brings a layout from before the top zone and windows up to date', () => {
    // What the first versions saved: three zones, no top, floats, tools or names.
    const old = {
      zones: {
        left: { tabs: ['layers'], active: 'layers', size: 280, collapsed: false },
        right: { tabs: ['colours', 'help'], active: 'help', size: 300, collapsed: true },
        bottom: { tabs: ['timeline'], active: 'timeline', size: 260, collapsed: false },
      },
      hidden: ['library'],
      known: ['layers', 'colours', 'help', 'timeline', 'library'],
    };
    const l = normaliseLayout(old);
    expect(l.zones.top).toEqual({ tabs: [], active: null, size: 160, collapsed: false });
    expect(l.floats).toEqual([]);
    expect(l.tools.place).toBe('left');
    expect(l.zones.right).toEqual({ tabs: ['colours', 'help'], active: 'help', size: 300, collapsed: true });
    expect(l.hidden).toEqual(['library']);
    expect(l.names).toBeUndefined();
  });
  it('turns nothing and nonsense into an empty layout', () => {
    for (const bad of [undefined, null, 5, 'x', [], { zones: 4 }]) {
      const l = normaliseLayout(bad);
      expect(placedIds(l)).toEqual([]);
      expect(l.tools.place).toBe('left');
    }
  });
  it('keeps each panel in one place only, and drops what is not an id', () => {
    const l = normaliseLayout({
      zones: { left: { tabs: ['a', 'b', 'a', 7, '', 'has space'] }, right: { tabs: ['b', 'c'] } },
      floats: [{ id: 'f1', tabs: ['c', 'd'], active: 'd' }],
      hidden: ['a', 'e'],
    });
    expect(tabs(l, 'left')).toEqual(['a', 'b']);
    expect(tabs(l, 'right')).toEqual(['c']);
    expect(l.floats[0].tabs).toEqual(['d']);
    expect(l.hidden).toEqual(['e']);
  });
  it('keeps numbers in range and the active tab real', () => {
    const l = normaliseLayout({ zones: { top: { tabs: ['a'], active: 'zzz', size: 99999 }, left: { tabs: ['a2'], size: -4 } }, floats: [{ id: 'f', tabs: ['x'], x: 'no', w: 3, h: 1e9 }], tools: { place: 'sideways', x: 12.6 } });
    expect(l.zones.top.active).toBe('a');
    expect(l.zones.top.size).toBe(600);
    expect(l.zones.left.size).toBe(180);
    expect(l.floats[0]).toMatchObject({ x: 120, w: 220 });
    expect(l.tools).toEqual({ place: 'left', x: 13, y: 110 });
  });
  it('drops windows with nothing in them, caps how many there are, and gives repeated ids new ones', () => {
    const floats = Array.from({ length: 30 }, (_, i) => ({ id: 'same', tabs: [`p${i}`] }));
    const l = normaliseLayout({ floats: [{ id: 'empty', tabs: [] }, ...floats] });
    expect(l.floats.length).toBe(12);
    expect(new Set(l.floats.map((f) => f.id)).size).toBe(12);
  });
  it('cleans names', () => {
    const l = normaliseLayout({ names: { layers: '  Page\u0000 list  ', bad: 3, 'no good': 'x', big: 'y'.repeat(200) }, floats: [{ id: 'f', name: 'A\nB', tabs: ['x'] }] });
    expect(l.names!.layers).toBe('Page list');
    expect(l.names!.big.length).toBe(40);
    expect(Object.keys(l.names!).sort()).toEqual(['big', 'layers']);
    expect(l.floats[0].name).toBe('A B');
  });
  it('is stable: tidying a tidy layout changes nothing', () => {
    const l = sample();
    l.floats.push({ id: 'f1', name: 'Mine', tabs: ['x'], active: 'x', x: 10, y: 20, w: 300, h: 200 });
    l.names = { layers: 'Pages' };
    expect(normaliseLayout(l)).toEqual(l);
  });
});

describe('bringing back a hidden panel', () => {
  it('makes a new layout, and leaves the old one alone, so the change is seen', () => {
    const before = closePanel(sample(), 'library');
    const snapshot = JSON.stringify(before);
    const after = movePanelTo(before, 'library', { zone: 'right' });
    expect(after).not.toBe(before);
    expect(after.zones.right).not.toBe(before.zones.right);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(tabs(after, 'right')).toContain('library');
    expect(after.hidden).not.toContain('library');
  });
  it('closing a panel that is already hidden changes nothing', () => {
    const hidden = closePanel(sample(), 'library');
    expect(closePanel(hidden, 'library')).toBe(hidden);
  });
});

describe('moving panels', () => {
  it('moves between zones and makes it the front tab', () => {
    const l = movePanelTo(sample(), 'library', { zone: 'top' });
    expect(tabs(l, 'top')).toEqual(['library']);
    expect(l.zones.top.active).toBe('library');
    expect(tabs(l, 'right')).toEqual(['colours', 'help']);
  });
  it('hands the front tab to its neighbour when the front one leaves', () => {
    const l = movePanelTo(sample(), 'colours', { zone: 'left' });
    expect(l.zones.right.active).toBe('library');
  });
  it('reorders within a zone, counting the slot as if the panel was lifted out', () => {
    expect(tabs(movePanelTo(sample(), 'colours', { zone: 'right', index: 3 }), 'right')).toEqual(['library', 'help', 'colours']);
    expect(tabs(movePanelTo(sample(), 'help', { zone: 'right', index: 0 }), 'right')).toEqual(['help', 'colours', 'library']);
    expect(tabs(movePanelTo(sample(), 'colours', { zone: 'right', index: 1 }), 'right')).toEqual(['colours', 'library', 'help']);
  });
  it('opens a folded zone it lands in', () => {
    const l = sample();
    l.zones.top.collapsed = true;
    expect(movePanelTo(l, 'help', { zone: 'top' }).zones.top.collapsed).toBe(false);
  });
  it('brings a closed panel back where it is dropped', () => {
    const l = closePanel(sample(), 'library');
    expect(l.hidden).toEqual(['library']);
    const back = movePanelTo(l, 'library', { zone: 'bottom', index: 0 });
    expect(back.hidden).toEqual([]);
    expect(tabs(back, 'bottom')).toEqual(['library', 'timeline']);
  });
  it('a panel dropped on empty canvas gets a window, kept on screen', () => {
    const l = movePanelTo(sample(), 'library', { newFloat: { x: 5000, y: -40 } }, { w: 1280, h: 800 });
    expect(l.floats).toHaveLength(1);
    const f = l.floats[0];
    expect(f.tabs).toEqual(['library']);
    expect(f.x).toBeLessThanOrEqual(1280 - 120);
    expect(f.y).toBe(0);
    expect(locate(l, 'library')).toEqual({ float: f.id });
    expect(tabs(l, 'right')).not.toContain('library');
  });
  it('windows take tabs at a position, and close when their last panel leaves', () => {
    let l = movePanelTo(sample(), 'library', { newFloat: { x: 100, y: 100 } });
    const id = l.floats[0].id;
    l = movePanelTo(l, 'help', { float: id, index: 0 });
    expect(l.floats[0].tabs).toEqual(['help', 'library']);
    expect(l.floats[0].active).toBe('help');
    l = movePanelTo(l, 'help', { zone: 'right' });
    l = movePanelTo(l, 'library', { zone: 'right' });
    expect(l.floats).toEqual([]);
  });
  it('reordering the only tab of a window keeps the window', () => {
    const l = movePanelTo(sample(), 'library', { newFloat: { x: 100, y: 100, w: 300, h: 200 } });
    const f = l.floats[0];
    const again = movePanelTo(l, 'library', { float: f.id, index: 0 });
    expect(again.floats).toHaveLength(1);
    expect(again.floats[0]).toMatchObject({ id: f.id, tabs: ['library'], x: 100, y: 100 });
  });
  it('never shows a panel in two places, and does not change the layout it was given', () => {
    const l = sample();
    const before = JSON.stringify(l);
    const n = movePanelTo(movePanelTo(l, 'help', { newFloat: { x: 1, y: 1 } }), 'help', { zone: 'bottom' });
    expect(JSON.stringify(l)).toBe(before);
    const all = placedIds(n);
    expect(new Set(all).size).toBe(all.length);
  });
  it('a panel nobody had placed lands where asked and is known', () => {
    const l = movePanelTo(emptyLayout(), 'fresh', { zone: 'left' });
    expect(tabs(l, 'left')).toEqual(['fresh']);
    expect(l.known).toContain('fresh');
  });
});

describe('windows as groups', () => {
  const withFloat = () => {
    let l = movePanelTo(sample(), 'library', { newFloat: { x: 100, y: 100 } });
    l = movePanelTo(l, 'help', { float: l.floats[0].id });
    return l;
  };
  it('a whole window docks into a zone, in order, and closes', () => {
    const l = withFloat();
    const n = moveGroupTo(l, l.floats[0].id, { zone: 'top' });
    expect(tabs(n, 'top')).toEqual(['library', 'help']);
    expect(n.zones.top.active).toBe('help');
    expect(n.floats).toEqual([]);
  });
  it('a window can join another', () => {
    let l = withFloat();
    l = movePanelTo(l, 'timeline', { newFloat: { x: 300, y: 300 } });
    const [a, b] = l.floats;
    const n = moveGroupTo(l, b.id, { float: a.id });
    expect(n.floats).toHaveLength(1);
    expect(n.floats[0].tabs).toEqual(['library', 'help', 'timeline']);
  });
  it('does nothing onto itself or onto empty canvas', () => {
    const l = withFloat();
    expect(moveGroupTo(l, l.floats[0].id, { float: l.floats[0].id })).toBe(l);
    expect(moveGroupTo(l, l.floats[0].id, { newFloat: { x: 1, y: 1 } })).toBe(l);
  });
  it('docking back sends every panel to the zone it was made for', () => {
    let l = movePanelTo(sample(), 'timeline', { newFloat: { x: 100, y: 100 } });
    l = movePanelTo(l, 'layers', { float: l.floats[0].id });
    const n = dockFloat(l, l.floats[0].id, home);
    expect(n.floats).toEqual([]);
    expect(tabs(n, 'bottom')).toEqual(['timeline']);
    expect(tabs(n, 'left')).toEqual(['layers']);
  });
  it('docks every window back at once', () => {
    let l = movePanelTo(sample(), 'timeline', { newFloat: { x: 100, y: 100 } });
    l = movePanelTo(l, 'layers', { newFloat: { x: 200, y: 200 } });
    expect(dockAllFloats(l, home).floats).toEqual([]);
  });
  it('closing a window closes its panels', () => {
    const l = withFloat();
    const n = closeFloat(l, l.floats[0].id);
    expect(n.floats).toEqual([]);
    expect(n.hidden.sort()).toEqual(['help', 'library']);
  });
});

describe('showing, raising, sizing, naming', () => {
  it('bringing a panel forward opens its folded zone', () => {
    const l = sample();
    l.zones.right.collapsed = true;
    const n = frontPanel(l, 'help');
    expect(n.zones.right).toMatchObject({ active: 'help', collapsed: false });
  });
  it('bringing a panel in a window forward raises the window', () => {
    let l = movePanelTo(sample(), 'library', { newFloat: { x: 1, y: 1 } });
    l = movePanelTo(l, 'help', { newFloat: { x: 50, y: 50 } });
    const first = l.floats[0].id;
    expect(l.floats[1].tabs).toEqual(['help']);
    expect(frontPanel(l, 'library').floats.at(-1)!.id).toBe(first);
    expect(raiseFloat(l, first).floats.at(-1)!.id).toBe(first);
    expect(raiseFloat(l, l.floats[1].id)).toBe(l);
  });
  it('moving a window only replaces that window', () => {
    let l = movePanelTo(sample(), 'library', { newFloat: { x: 1, y: 1 } });
    l = movePanelTo(l, 'help', { newFloat: { x: 50, y: 50 } });
    const n = setFloatBox(l, l.floats[0].id, { x: 9, w: 500 });
    expect(n.floats[0]).toMatchObject({ x: 9, w: 500 });
    expect(n.floats[1]).toBe(l.floats[1]);
    expect(n.zones).toBe(l.zones);
  });
  it('keeps a box on the screen: smaller than it, with the title bar reachable', () => {
    expect(clampBox({ x: -50, y: 9999, w: 5000, h: 5000 }, { w: 1000, h: 700 })).toEqual({ x: 0, y: 664, w: 1000, h: 700 });
    expect(clampBox({ x: 990, y: 10, w: 400, h: 300 }, { w: 1000, h: 700 }).x).toBe(880);
    expect(clampBox({ x: 10, y: 10, w: 10, h: 10 }, { w: 1000, h: 700 })).toMatchObject({ w: 220, h: 140 });
  });
  it('names panels and windows, and an empty name goes back to the default', () => {
    let l = renamePanelIn(sample(), 'layers', '  Pages ');
    expect(l.names).toEqual({ layers: 'Pages' });
    l = renamePanelIn(l, 'layers', '   ');
    expect(l.names).toBeUndefined();
    l = movePanelTo(l, 'library', { newFloat: { x: 1, y: 1 } });
    const id = l.floats[0].id;
    const title = (x: string) => x.toUpperCase();
    expect(floatTitle(l, l.floats[0], title)).toBe('LIBRARY');
    l = movePanelTo(l, 'help', { float: id });
    expect(floatTitle(l, l.floats[0], title)).toBe('HELP and 1 more');
    l = renameFloatIn(l, id, 'Reference');
    expect(floatTitle(l, l.floats[0], title)).toBe('Reference');
    expect(renameFloatIn(l, id, '').floats[0].name).toBeUndefined();
  });
  it('moves the tool rail', () => {
    const l = placeToolsIn(emptyLayout(), 'top');
    expect(l.tools.place).toBe('top');
    expect(placeToolsIn(l, 'float', { x: 200.4, y: 300 }).tools).toEqual({ place: 'float', x: 200, y: 300 });
    expect(placeToolsIn(placeToolsIn(l, 'float', { x: 5, y: 6 }), 'right').tools).toEqual({ place: 'right', x: 5, y: 6 });
  });
});

describe('workspaces from storage or a file', () => {
  it('keeps a good one and drops one with no name or id', () => {
    const ws = sanitizeWorkspace({ id: 'u-1', name: ' Mine ', layout: sample(), pixel: true, tools: { pixel: ['pencil', 'bad id!'], vector: 'no' }, about: 'x' });
    expect(ws).toMatchObject({ id: 'u-1', name: 'Mine', pixel: true, about: 'x' });
    expect(ws!.tools).toEqual({ pixel: ['pencil'] });
    expect(sanitizeWorkspace({ id: 'u-1', name: '' })).toBeNull();
    expect(sanitizeWorkspace({ name: 'x' })).toBeNull();
    expect(sanitizeWorkspace('nope')).toBeNull();
  });
  it('tidies the list: repeated ids dropped, at most 12', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `u-${i}`, name: `W${i}`, layout: {} }));
    expect(sanitizeWorkspaces([...many, many[0]])).toHaveLength(12);
    expect(sanitizeWorkspaces([many[0], many[0]])).toHaveLength(1);
    expect(sanitizeWorkspaces('x')).toEqual([]);
  });
});
