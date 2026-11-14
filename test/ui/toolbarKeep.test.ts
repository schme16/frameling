// @vitest-environment jsdom
// Nothing anyone has set up is lost. The tool arrangement lives in two places that already exist in people's hands:
// the dock save in localStorage (`rails` per workspace) and `rail` in a workspace file. The fixtures below are written
// out by hand the way earlier versions saved them. They must keep loading the same, and every new field of the
// builder (hidden tools, folded groups) must survive a save and a load in both places.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOCK_KEY } from '../../src/ui/dock';
import { emptyLayout } from '../../src/ui/dockModel';
import { sanitizeGroups, type ToolGroup } from '../../src/ui/toolArrange';
import { migratePrefs } from '../../src/ui/prefs';
import { parseWorkspaceText, WORKSPACE_FORMAT, WORKSPACE_VERSION } from '../../src/ui/workspaceFile';

// What a dock save looked like before the builder: names, moved tools, a group of your own. No other fields.
const OLD_RAILS: Record<string, ToolGroup[]> = {
  draw: [
    { id: 'draw', tools: ['pencil', 'brush', 'eraser', 'fill'] },
    { id: 'shapes', name: 'Blocking', tools: ['line', 'rect', 'ellipse', 'polygon', 'text'] },
    { id: 'g7', tools: ['star'] },
    { id: 'view', tools: ['hand', 'zoom'] },
  ],
  animate: [{ id: 'g1', name: 'Faves', tools: ['brush', 'bone'] }],
};

const oldDockSave = (extra: Record<string, unknown> = {}) => JSON.stringify({ layout: emptyLayout(), workspaceId: 'draw', user: [], rails: OLD_RAILS, v: 2, ...extra });

/** A fresh copy of the dock, reading localStorage the way the app does at start-up. */
async function loadDock() {
  vi.resetModules();
  await import('../../src/renderer/features');
  return import('../../src/ui/dock');
}

beforeEach(() => localStorage.clear());

describe('an older dock save still loads exactly as it was', () => {
  it('keeps every workspace arrangement, names, groups of your own and all', async () => {
    localStorage.setItem(DOCK_KEY, oldDockSave());
    const d = await loadDock();
    expect(d.dock.get().rails).toEqual(OLD_RAILS);
    expect(d.railOf(d.dock.get())).toEqual(OLD_RAILS.draw);
  });

  it('adds no new fields to what it loaded', async () => {
    localStorage.setItem(DOCK_KEY, oldDockSave());
    const d = await loadDock();
    for (const g of d.dock.get().rails!.draw) expect(Object.keys(g).sort()).toEqual(g.name ? ['id', 'name', 'tools'] : ['id', 'tools']);
  });

  it('saves it back unchanged when nothing was done to it', async () => {
    localStorage.setItem(DOCK_KEY, oldDockSave());
    const d = await loadDock();
    d.placeTools('right');
    expect(JSON.parse(localStorage.getItem(DOCK_KEY)!).rails).toEqual(OLD_RAILS);
  });

  it('a version 1 save with the arrangement in the layout still moves it to the workspace', async () => {
    const layout = { ...emptyLayout(), tools: { place: 'left', x: 1, y: 2, groups: OLD_RAILS.draw } };
    localStorage.setItem(DOCK_KEY, JSON.stringify({ layout, workspaceId: 'draw', user: [], v: 1 }));
    const d = await loadDock();
    expect(d.dock.get().rails?.draw).toEqual(OLD_RAILS.draw);
    expect(d.dock.get().layout.tools.groups).toBeUndefined();
  });

  it('a save with no arrangement uses the default', async () => {
    localStorage.setItem(DOCK_KEY, JSON.stringify({ layout: emptyLayout(), workspaceId: 'draw', user: [], v: 2 }));
    const d = await loadDock();
    expect(d.dock.get().rails).toBeUndefined();
  });
});

describe('an older workspace file still brings its arrangement', () => {
  const file = (rail: unknown) =>
    JSON.stringify({ format: WORKSPACE_FORMAT, version: 1, name: 'Mine', layout: emptyLayout(), rail });

  it('reads the arrangement as it was', () => {
    const r = parseWorkspaceText(file(OLD_RAILS.draw));
    expect(r.ok && r.workspace.rail).toEqual(OLD_RAILS.draw);
  });

  it('the file stays at version 1 when it carries the new fields', async () => {
    expect(WORKSPACE_VERSION).toBe(1);
    localStorage.setItem(DOCK_KEY, oldDockSave());
    const d = await loadDock();
    d.setToolGroups([{ id: 'draw', tools: ['pencil', 'brush'], hidden: ['brush'], fold: true }]);
    const ws = d.saveWorkspace('Builder')!;
    expect(JSON.parse(d.workspaceText(ws.id)!).version).toBe(1);
  });
});

describe('sanitizing is steady', () => {
  it('sanitizing twice changes nothing', () => {
    const once = sanitizeGroups(OLD_RAILS.draw)!;
    expect(sanitizeGroups(once)).toEqual(once);
    const grown = sanitizeGroups([{ id: 'a', tools: ['pencil', 'brush', 'eraser'], hidden: ['brush'], fold: true }])!;
    expect(sanitizeGroups(grown)).toEqual(grown);
  });

  it('an old arrangement comes out the same as it went in', () => {
    expect(sanitizeGroups(OLD_RAILS.draw)).toEqual(OLD_RAILS.draw);
    expect(sanitizeGroups(OLD_RAILS.animate)).toEqual(OLD_RAILS.animate);
  });
});

describe('the new fields are kept, and only when they are sound', () => {
  it('keeps hidden tools and a folded group', () => {
    expect(sanitizeGroups([{ id: 'a', name: 'Pens', tools: ['pencil', 'brush', 'eraser'], hidden: ['brush', 'eraser'], fold: true }])).toEqual([{ id: 'a', name: 'Pens', tools: ['pencil', 'brush', 'eraser'], hidden: ['brush', 'eraser'], fold: true }]);
  });

  it('drops a hidden tool that is not in the group, a repeat, and anything that is not an id', () => {
    const g = sanitizeGroups([{ id: 'a', tools: ['pencil', 'brush'], hidden: ['brush', 'brush', 'fill', 7, '../x'] }]);
    expect(g).toEqual([{ id: 'a', tools: ['pencil', 'brush'], hidden: ['brush'] }]);
  });

  it('leaves out an empty hidden list and a fold that is not true', () => {
    expect(sanitizeGroups([{ id: 'a', tools: ['pencil'], hidden: [], fold: false }])).toEqual([{ id: 'a', tools: ['pencil'] }]);
    expect(sanitizeGroups([{ id: 'a', tools: ['pencil'], hidden: 'pencil', fold: 'yes' }])).toEqual([{ id: 'a', tools: ['pencil'] }]);
  });

  it('survives a save and a load of the dock', async () => {
    const mine: ToolGroup[] = [{ id: 'draw', name: 'Pens', tools: ['pencil', 'brush', 'eraser'], hidden: ['eraser'], fold: true }, { id: 'g2', tools: ['hand'] }];
    localStorage.setItem(DOCK_KEY, oldDockSave());
    const d = await loadDock();
    d.setToolGroups(mine);
    const d2 = await loadDock();
    expect(d2.railOf(d2.dock.get())).toEqual(mine);
    // The other workspace is where it was.
    expect(d2.dock.get().rails?.animate).toEqual(OLD_RAILS.animate);
  });

  it('survives a saved workspace, its file and an import', async () => {
    const mine: ToolGroup[] = [{ id: 'draw', tools: ['pencil', 'brush'], hidden: ['brush'], fold: true }];
    const d = await loadDock();
    d.setToolGroups(mine);
    const ws = d.saveWorkspace('Builder')!;
    expect(ws.rail).toEqual(mine);
    const r = d.importWorkspace(d.workspaceText(ws.id)!);
    expect(r.ok && r.workspace.rail).toEqual(mine);
  });

  it('an app that does not know the fields still reads the file (they are only extra keys to it)', () => {
    const r = parseWorkspaceText(JSON.stringify({ format: WORKSPACE_FORMAT, version: 1, name: 'Mine', layout: emptyLayout(), rail: [{ id: 'draw', tools: ['pencil'], hidden: ['pencil'], fold: true, later: 1 }] }));
    expect(r.ok && r.workspace.rail).toEqual([{ id: 'draw', tools: ['pencil'], hidden: ['pencil'], fold: true }]);
  });
});

describe('preferences saved before the builder', () => {
  it('load with the usual button size, names and rail style', () => {
    const p = migratePrefs({ theme: 'dark', toolRail: 'stacked' });
    expect(p.toolRail).toBe('stacked');
    expect(p.toolSize).toBe('medium');
    // Names show out of the box, and tools that do not work on the layer are left out of the rail.
    expect(p.toolNames).toBe(true);
    expect(p.toolsOffLayer).toBe('hide');
  });

  it('keep a size and a names setting, and refuse nonsense', () => {
    expect(migratePrefs({ toolSize: 'large', toolNames: false, toolsOffLayer: 'grey' })).toMatchObject({ toolSize: 'large', toolNames: false, toolsOffLayer: 'grey' });
    expect(migratePrefs({ toolSize: 'huge', toolNames: 'yes', toolsOffLayer: 'maybe' })).toMatchObject({ toolSize: 'medium', toolNames: true, toolsOffLayer: 'hide' });
  });
});
