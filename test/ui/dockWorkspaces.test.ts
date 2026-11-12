// @vitest-environment jsdom
// The dock's live state: floating windows, the tool rail, names, loading a layout saved by an older version, and the
// workspaces (saving up to 12, renaming, reordering, deleting, sharing as a file or as text).
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerPanel } from '../../src/core/registry';
import {
  applyWorkspace,
  currentWorkspace,
  deleteWorkspace,
  dock,
  dockEverythingBack,
  dockFloatBack,
  DOCK_KEY,
  floatPanel,
  hidePanel,
  importWorkspace,
  isVisible,
  listWorkspaces,
  MAX_SAVED,
  moveWorkspace,
  panelTitle,
  placeOf,
  placePanel,
  placeTools,
  reconcile,
  renameFloat,
  renamePanel,
  renameWorkspace,
  resetDock,
  saveWorkspace,
  setActive,
  setFloatActive,
  showPanel,
  syncPanels,
  togglePanel,
  workspaceText,
  zoneOf,
} from '../../src/ui/dock';
import { parseWorkspaceText, uniqueWorkspaceName, workspaceFileName, workspaceToText, MAX_WORKSPACE_BYTES } from '../../src/ui/workspaceFile';

const Nothing = () => null;
const panels = [
  { id: 'timeline', title: 'Timeline', zone: 'bottom' as const, order: 10 },
  { id: 'layers', title: 'Layers', zone: 'right' as const, order: 20 },
  { id: 'colours', title: 'Colours', zone: 'right' as const, order: 10 },
  { id: 'help', title: 'Help', zone: 'right' as const, order: 90 },
];
beforeAll(() => {
  for (const p of panels) registerPanel({ ...p, icon: 'plus', component: Nothing });
});
beforeEach(() => resetDock());
const l = () => dock.get().layout;

describe('floating windows', () => {
  it('a panel floats, and is still visible, with its place a window', () => {
    floatPanel('layers');
    expect(l().floats).toHaveLength(1);
    expect(isVisible('layers')).toBe(true);
    expect(zoneOf('layers')).toBeNull();
    expect(placeOf('layers')).toEqual({ float: l().floats[0].id });
    expect(l().zones.right.tabs).not.toContain('layers');
  });
  it('stacks new windows a little apart', () => {
    floatPanel('layers');
    floatPanel('help');
    const [a, b] = l().floats;
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBeGreaterThan(a.y);
  });
  it('dragging onto another window makes one window with two tabs', () => {
    floatPanel('layers');
    placePanel('help', { float: l().floats[0].id });
    expect(l().floats).toHaveLength(1);
    expect(l().floats[0].tabs).toEqual(['layers', 'help']);
    setFloatActive(l().floats[0].id, 'layers');
    expect(l().floats[0].active).toBe('layers');
  });
  it('docks back to where each panel was made to go', () => {
    floatPanel('timeline');
    placePanel('help', { float: l().floats[0].id });
    dockFloatBack(l().floats[0].id);
    expect(l().floats).toEqual([]);
    expect(zoneOf('timeline')).toBe('bottom');
    expect(zoneOf('help')).toBe('right');
  });
  it('dock everything back', () => {
    floatPanel('timeline');
    floatPanel('layers');
    dockEverythingBack();
    expect(l().floats).toEqual([]);
  });
  it('showing a floating panel brings its window forward; toggling closes it', () => {
    floatPanel('layers');
    floatPanel('help');
    const first = l().floats[0].id;
    showPanel('layers');
    expect(l().floats.at(-1)!.id).toBe(first);
    togglePanel('layers');
    expect(isVisible('layers')).toBe(false);
    expect(l().floats.map((f) => f.tabs)).toEqual([['help']]);
    togglePanel('layers');
    expect(isVisible('layers')).toBe(true);
  });
  it('closing a panel in a window closes the window when it was the last', () => {
    floatPanel('layers');
    hidePanel('layers');
    expect(l().floats).toEqual([]);
    expect(l().hidden).toContain('layers');
  });
  it('a panel put in the top zone is docked there', () => {
    placePanel('layers', { zone: 'top' });
    expect(zoneOf('layers')).toBe('top');
    setActive('top', 'layers');
    expect(l().zones.top.active).toBe('layers');
  });
});

describe('names and the tool rail', () => {
  it('renames panels and windows', () => {
    renamePanel('layers', 'Pages');
    expect(panelTitle('layers')).toBe('Pages');
    renamePanel('layers', '');
    expect(panelTitle('layers')).toBe('Layers');
    floatPanel('help');
    renameFloat(l().floats[0].id, 'Reference');
    expect(l().floats[0].name).toBe('Reference');
  });
  it('names go with a saved workspace', () => {
    renamePanel('layers', 'Pages');
    const ws = saveWorkspace('Named')!;
    applyWorkspace('draw');
    expect(panelTitle('layers')).toBe('Layers');
    applyWorkspace(ws.id);
    expect(panelTitle('layers')).toBe('Pages');
  });
  it('the rail goes to any side or floats, and is kept with the layout', () => {
    placeTools('top');
    expect(l().tools.place).toBe('top');
    const ws = saveWorkspace('Tools up')!;
    placeTools('float', { x: 300, y: 200 });
    expect(l().tools).toEqual({ place: 'float', x: 300, y: 200 });
    applyWorkspace(ws.id);
    expect(l().tools.place).toBe('top');
  });
  it('a workspace keeps its windows', () => {
    floatPanel('layers');
    const ws = saveWorkspace('Floaty')!;
    applyWorkspace('draw');
    expect(l().floats).toEqual([]);
    applyWorkspace(ws.id);
    expect(l().floats[0].tabs).toEqual(['layers']);
  });
});

describe('reconcile', () => {
  it('drops windows whose panels are gone, and places panels that came later once', () => {
    const base = l();
    const next = reconcile({ ...base, floats: [{ id: 'f', tabs: ['gone', 'layers'], active: 'gone', x: 1, y: 1, w: 300, h: 300 }, { id: 'g', tabs: ['nope'], active: 'nope', x: 1, y: 1, w: 300, h: 300 }], zones: { ...base.zones, right: { ...base.zones.right, tabs: base.zones.right.tabs.filter((t) => t !== 'layers') } } });
    expect(next.floats).toHaveLength(1);
    expect(next.floats[0]).toMatchObject({ tabs: ['layers'], active: 'layers' });
  });
  it('does not put a window panel in a zone as well', () => {
    const next = reconcile({ ...l(), floats: [{ id: 'f', tabs: ['colours'], active: 'colours', x: 1, y: 1, w: 300, h: 300 }] });
    const all = [...Object.values(next.zones).flatMap((z) => z.tabs), ...next.floats.flatMap((f) => f.tabs)];
    expect(all.filter((x) => x === 'colours')).toHaveLength(1);
  });
  it('a panel registered late goes to its zone once, and stays closed if closed', () => {
    registerPanel({ id: 'late', title: 'Late', icon: 'plus', component: Nothing, zone: 'top', order: 5 });
    syncPanels();
    expect(zoneOf('late')).toBe('top');
    hidePanel('late');
    syncPanels();
    expect(isVisible('late')).toBe(false);
  });
  it('brings an older layout up to date', () => {
    const old = { zones: { left: { tabs: [], active: null, size: 260, collapsed: false }, right: { tabs: ['colours', 'layers'], active: 'colours', size: 316, collapsed: false }, bottom: { tabs: ['timeline'], active: 'timeline', size: 230, collapsed: false } }, hidden: ['help'], known: ['colours', 'layers', 'timeline', 'help'] };
    const n = reconcile(old as never);
    expect(n.zones.top.tabs.filter((t) => t !== 'late')).toEqual([]);
    expect(n.floats).toEqual([]);
    expect(n.tools.place).toBe('left');
    expect(n.hidden).toContain('help');
  });
});

describe('loading what an older version saved', () => {
  it('opens a layout saved before windows and the top zone', async () => {
    localStorage.setItem(
      DOCK_KEY,
      JSON.stringify({
        layout: { zones: { left: { tabs: ['layers'], active: 'layers', size: 270, collapsed: false }, right: { tabs: ['colours'], active: 'colours', size: 300, collapsed: false }, bottom: { tabs: ['timeline'], active: 'timeline', size: 240, collapsed: false } }, hidden: [], known: ['layers', 'colours', 'timeline'] },
        workspaceId: 'animate',
        user: [{ id: 'u-old', name: 'Old one', layout: { zones: { left: { tabs: ['layers'], active: 'layers', size: 250, collapsed: false }, right: { tabs: [], active: null, size: 316, collapsed: false }, bottom: { tabs: [], active: null, size: 230, collapsed: false } }, hidden: [], known: [] } }],
      }),
    );
    vi.resetModules();
    const m = await import('../../src/ui/dock');
    const s = m.dock.get();
    expect(s.workspaceId).toBe('animate');
    expect(s.layout.zones.left.size).toBe(270);
    expect(s.layout.zones.top.tabs).toEqual([]);
    expect(s.layout.floats).toEqual([]);
    expect(s.layout.tools.place).toBe('left');
    expect(s.user).toHaveLength(1);
    expect(s.user[0].layout.zones.top.size).toBe(160);
    expect(s.fresh).toBeUndefined();
  });
  it('starts fresh on garbage, and keeps the good workspaces', async () => {
    localStorage.setItem(DOCK_KEY, JSON.stringify({ layout: 7, user: [{ id: 'u-1', name: 'Good', layout: {} }, { nope: true }, 3] }));
    vi.resetModules();
    const m = await import('../../src/ui/dock');
    expect(m.dock.get().fresh).toBe(true);
    expect(m.dock.get().user.map((w) => w.name)).toEqual(['Good']);
    localStorage.setItem(DOCK_KEY, '{not json');
    vi.resetModules();
    const m2 = await import('../../src/ui/dock');
    expect(m2.dock.get().fresh).toBe(true);
  });
  it('writes the new shape out with a version', () => {
    floatPanel('layers');
    const raw = JSON.parse(localStorage.getItem(DOCK_KEY)!);
    expect(raw.v).toBe(2);
    expect(raw.layout.floats).toHaveLength(1);
  });
});

describe('your workspaces', () => {
  it('keeps at most 12, and says no to a 13th but still replaces one by name', () => {
    for (let i = 0; i < MAX_SAVED; i++) expect(saveWorkspace(`W${i}`)).not.toBeNull();
    expect(dock.get().user).toHaveLength(MAX_SAVED);
    expect(saveWorkspace('One too many')).toBeNull();
    expect(saveWorkspace('w3')).not.toBeNull();
    expect(dock.get().user).toHaveLength(MAX_SAVED);
  });
  it('renames, and ignores an empty name', () => {
    const w = saveWorkspace('First')!;
    renameWorkspace(w.id, '  Second ');
    expect(listWorkspaces().find((x) => x.id === w.id)!.name).toBe('Second');
    renameWorkspace(w.id, '  ');
    expect(listWorkspaces().find((x) => x.id === w.id)!.name).toBe('Second');
  });
  it('reorders your own, never the ones that come with the app', () => {
    const a = saveWorkspace('A')!;
    const b = saveWorkspace('B')!;
    const c = saveWorkspace('C')!;
    moveWorkspace(c.id, 0);
    expect(dock.get().user.map((w) => w.name)).toEqual(['C', 'A', 'B']);
    moveWorkspace(a.id, 99);
    expect(dock.get().user.map((w) => w.name)).toEqual(['C', 'B', 'A']);
    moveWorkspace('draw', 0);
    expect(listWorkspaces().slice(0, 3).map((w) => w.id)).toEqual(['draw', 'animate', 'pixel']);
    expect(b.name).toBe('B');
  });
  it('deleting the one in use goes back to Draw', () => {
    const w = saveWorkspace('Temp')!;
    expect(currentWorkspace()!.id).toBe(w.id);
    deleteWorkspace(w.id);
    expect(currentWorkspace()!.id).toBe('draw');
  });
  it('the built-ins say what they are for', () => {
    for (const w of listWorkspaces().filter((x) => x.builtin)) expect(w.about, w.id).toMatch(/\S{3,}/);
  });
});

describe('sharing a workspace', () => {
  it('round trips through text', () => {
    floatPanel('layers');
    renamePanel('help', 'Tips');
    placeTools('right');
    const w = saveWorkspace('Share me')!;
    const text = workspaceText(w.id)!;
    expect(JSON.parse(text).format).toBe('frameling-workspace');
    deleteWorkspace(w.id);
    const r = importWorkspace(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.workspace.name).toBe('Share me');
    expect(r.workspace.id).not.toBe(w.id);
    applyWorkspace(r.workspace.id);
    expect(l().floats[0].tabs).toEqual(['layers']);
    expect(panelTitle('help')).toBe('Tips');
    expect(l().tools.place).toBe('right');
  });
  it('gives an imported workspace a name that is not taken', () => {
    saveWorkspace('Twin');
    const text = workspaceText(dock.get().user[0].id)!;
    const r = importWorkspace(text);
    expect(r.ok && r.workspace.name).toBe('Twin 2');
    const r2 = importWorkspace(text);
    expect(r2.ok && r2.workspace.name).toBe('Twin 3');
    const r3 = importWorkspace(JSON.stringify({ ...JSON.parse(text), name: 'Draw' }));
    expect(r3.ok && r3.workspace.name).toBe('Draw 2');
  });
  it('exports the layout as it is now when no workspace is named', () => {
    floatPanel('help');
    const text = workspaceText()!;
    expect(JSON.parse(text).layout.floats).toHaveLength(1);
    expect(workspaceText('nope')).toBeNull();
  });
  it('skips panels this Frameling does not have, and places ones the file does not mention', () => {
    const file = JSON.stringify({ format: 'frameling-workspace', version: 1, name: 'Foreign', layout: { zones: { left: { tabs: ['alien', 'layers'] }, right: { tabs: ['colours'] } }, known: ['alien', 'layers', 'colours'] } });
    const r = importWorkspace(file);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    applyWorkspace(r.workspace.id);
    expect(l().zones.left.tabs).toEqual(['layers']);
    expect(zoneOf('help')).toBe('right');
    expect(zoneOf('timeline')).toBe('bottom');
  });
  it('turns away a full list', () => {
    for (let i = 0; i < MAX_SAVED; i++) saveWorkspace(`W${i}`);
    const r = importWorkspace(workspaceToText(listWorkspaces()[0]));
    expect(r.ok).toBe(false);
    expect(dock.get().user).toHaveLength(MAX_SAVED);
  });
});

describe('workspace files', () => {
  const good = () => workspaceToText({ id: 'x', name: 'Mine', layout: { zones: { left: { tabs: ['a'], active: 'a', size: 260, collapsed: false }, right: { tabs: [], active: null, size: 316, collapsed: false }, bottom: { tabs: [], active: null, size: 230, collapsed: false }, top: { tabs: [], active: null, size: 160, collapsed: false } }, floats: [], tools: { place: 'left', x: 1, y: 2 }, hidden: [], known: ['a'] } });
  it('reads what it wrote', () => {
    const r = parseWorkspaceText(good());
    expect(r.ok && r.workspace.layout.zones.left.tabs).toEqual(['a']);
  });
  it('says what is wrong with something that is not a workspace', () => {
    const bad: [unknown, RegExp][] = [
      [42, /not a workspace/],
      ['{nope', /not a workspace/],
      ['{"hello":1}', /Frameling workspace/],
      ['[1,2]', /Frameling workspace/],
      [JSON.stringify({ format: 'frameling-workspace', version: 99, name: 'x', layout: {} }), /newer/],
      [JSON.stringify({ format: 'frameling-workspace', version: 1, name: 'x' }), /no layout/],
      [JSON.stringify({ format: 'frameling-workspace', version: 1, name: '  ', layout: {} }), /no name/],
      ['x'.repeat(MAX_WORKSPACE_BYTES + 1), /too big/],
    ];
    for (const [text, re] of bad) {
      const r = parseWorkspaceText(text);
      expect(r.ok, String(text).slice(0, 30)).toBe(false);
      if (!r.ok) expect(r.error).toMatch(re);
    }
  });
  it('does not trust what is inside', () => {
    const hostile = JSON.stringify({
      format: 'frameling-workspace',
      version: 1,
      name: '<b>x</b>\u0000'.repeat(20),
      about: 'y'.repeat(1000),
      layout: { zones: { left: { tabs: ['__proto__', 'constructor', '../x', 'ok'] } }, floats: Array.from({ length: 100 }, (_, i) => ({ tabs: [`f${i}`], x: 'a', y: {}, w: Infinity })), names: { ok: { evil: 1 }, __proto__: 'x' }, tools: { place: '<script>' } },
      tools: { pixel: Array.from({ length: 500 }, (_, i) => `t${i}`) },
    });
    const r = parseWorkspaceText(hostile);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const w = r.workspace;
    expect(w.name.length).toBeLessThanOrEqual(40);
    expect(w.name).not.toContain('\u0000');
    expect(w.about!.length).toBeLessThanOrEqual(140);
    expect(w.layout.zones.left.tabs).toEqual(['ok']);
    expect(w.layout.floats.length).toBeLessThanOrEqual(12);
    expect(w.layout.names).toBeUndefined();
    expect(w.layout.tools.place).toBe('left');
    expect(w.tools!.pixel!.length).toBeLessThanOrEqual(80);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('makes a safe file name and a free name', () => {
    expect(workspaceFileName('My cosy / corner!')).toBe('my-cosy-corner.frameling-workspace.json');
    expect(workspaceFileName('///')).toBe('workspace.frameling-workspace.json');
    expect(uniqueWorkspaceName('Mine', ['mine', 'Mine 2'])).toBe('Mine 3');
    expect(uniqueWorkspaceName('   ', [])).toBe('My workspace');
    expect(uniqueWorkspaceName('x'.repeat(60), []).length).toBe(40);
  });
});
