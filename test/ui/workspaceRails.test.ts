// @vitest-environment jsdom
// Each workspace has its own tool rail: defaults that come with it, changes kept per workspace, reset to its default.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { allTools } from '../../src/core/registry';
import { line } from '../../src/ui/mascot/lines';
import { applyWorkspace, defaultRailOf, DOCK_KEY, dock, importWorkspace, railOf, resetDock, resetLayout, saveWorkspace, setToolGroups, workspaceText, deleteWorkspace } from '../../src/ui/dock';
import { BUILTIN_RAILS, resolveGroups, sanitizeGroups, type ToolGroup } from '../../src/ui/toolArrange';
import { currentGroups, isCustomArrangement, moveToolTo, resetToolArrangement } from '../../src/ui/toolRail';

beforeAll(async () => {
  await import('../../src/renderer/features');
});
beforeEach(() => {
  localStorage.clear();
  resetDock();
});

const ids = (g: ToolGroup[]) => g.map((x) => x.id);
const flat = (g: ToolGroup[]) => g.flatMap((x) => x.tools);
const groupOf = (g: ToolGroup[], tool: string) => g.find((x) => x.tools.includes(tool))?.id;
const every = () => flat(resolveGroups(undefined, allTools())).sort();

describe('the three defaults', () => {
  it('Draw: drawing first, then the standard order', () => {
    expect(ids(currentGroups())).toEqual(['draw', 'extras', 'shapes', 'select', 'rig', 'view']);
    expect(currentGroups()[0].tools.slice(0, 4)).toEqual(['pencil', 'brush', 'eraser', 'fill']);
  });
  it('Animate: drawing, then rig and motion, then the rest', () => {
    applyWorkspace('animate');
    const g = currentGroups();
    expect(ids(g)).toEqual(['draw', 'rig', 'select', 'shapes', 'extras', 'view']);
    expect(g[1].tools).toEqual(['bone', 'pose', 'weights', 'motion-path', 'shape-hints']);
  });
  it('Pixel: pixel tools first, shade, dither and pixel select together, vector-only tools later', () => {
    applyWorkspace('pixel');
    const g = currentGroups();
    expect(ids(g).slice(0, 3)).toEqual(['draw', 'pixel', 'shapes']);
    expect(g[0].tools.slice(0, 5)).toEqual(['pencil', 'brush', 'eraser', 'fill', 'eyedropper']);
    expect(g[1].tools).toEqual(['shade', 'dither', 'pixel-select']);
    expect(ids(g).indexOf('select')).toBeGreaterThan(ids(g).indexOf('pixel'));
    expect(ids(g).indexOf('rig')).toBeGreaterThan(ids(g).indexOf('shapes'));
    expect(groupOf(g, 'select')).toBe('select');
  });
  it('every default places every tool exactly once', () => {
    for (const id of ['draw', 'animate', 'pixel']) {
      applyWorkspace(id);
      expect(flat(currentGroups()).sort()).toEqual(every());
    }
  });
  it('the built-in workspaces all name a default', () => {
    for (const id of ['draw', 'animate', 'pixel']) expect(BUILTIN_RAILS[id]).toBeTruthy();
  });
});

describe('changes belong to the workspace they were made in', () => {
  it('switching workspace switches the arrangement, and your changes wait for you', () => {
    moveToolTo('hand', { newGroupAt: 0 });
    expect(currentGroups()[0].tools).toEqual(['hand']);
    expect(isCustomArrangement()).toBe(true);
    applyWorkspace('animate');
    expect(isCustomArrangement()).toBe(false);
    expect(ids(currentGroups())).toEqual(['draw', 'rig', 'select', 'shapes', 'extras', 'view']);
    applyWorkspace('draw');
    expect(currentGroups()[0].tools).toEqual(['hand']);
  });
  it('each workspace keeps its own changes', () => {
    moveToolTo('hand', { newGroupAt: 0 });
    applyWorkspace('animate');
    moveToolTo('zoom', { newGroupAt: 0 });
    applyWorkspace('draw');
    expect(currentGroups()[0].tools).toEqual(['hand']);
    expect(groupOf(currentGroups(), 'zoom')).toBe('view');
    applyWorkspace('animate');
    expect(currentGroups()[0].tools).toEqual(['zoom']);
    expect(groupOf(currentGroups(), 'hand')).toBe('view');
  });
  it('Reset tools to default goes back to that workspace\'s own default, not the standard one', () => {
    applyWorkspace('pixel');
    moveToolTo('hand', { newGroupAt: 0 });
    applyWorkspace('animate');
    moveToolTo('hand', { newGroupAt: 0 });
    resetToolArrangement();
    expect(ids(currentGroups())).toEqual(['draw', 'rig', 'select', 'shapes', 'extras', 'view']);
    expect(isCustomArrangement()).toBe(false);
    applyWorkspace('pixel');
    expect(isCustomArrangement()).toBe(true);
    resetToolArrangement();
    expect(ids(currentGroups()).slice(0, 2)).toEqual(['draw', 'pixel']);
    expect(dock.get().rails).toBeUndefined();
  });
  it('putting everything back by hand counts as the default again', () => {
    applyWorkspace('animate');
    const def = currentGroups();
    setToolGroups(def.map((g) => ({ ...g })));
    expect(isCustomArrangement()).toBe(false);
  });
  it('moving the rail or the layout does not touch the arrangement', () => {
    moveToolTo('hand', { newGroupAt: 0 });
    resetLayout();
    expect(currentGroups()[0].tools).toEqual(['hand']);
  });
});

describe('your own workspaces', () => {
  it('saving takes the arrangement as it is now as the new workspace\'s default', () => {
    applyWorkspace('pixel');
    const ws = saveWorkspace('Sprites')!;
    expect(ws.rail).toEqual(BUILTIN_RAILS.pixel);
    expect(ids(currentGroups()).slice(0, 2)).toEqual(['draw', 'pixel']);
    moveToolTo('hand', { newGroupAt: 0 });
    expect(isCustomArrangement()).toBe(true);
    resetToolArrangement();
    expect(ids(currentGroups()).slice(0, 2)).toEqual(['draw', 'pixel']);
  });
  it('a changed workspace of your own keeps its changes, and Reset layout brings back what was saved', () => {
    const ws = saveWorkspace('Mine')!;
    moveToolTo('hand', { newGroupAt: 0 });
    applyWorkspace('animate');
    applyWorkspace(ws.id);
    expect(currentGroups()[0].tools).toEqual(['hand']);
    resetLayout();
    expect(currentGroups()[0].tools[0]).toBe('pencil');
  });
  it('saving over it again folds its changes in; deleting it forgets them', () => {
    const ws = saveWorkspace('Mine')!;
    moveToolTo('hand', { newGroupAt: 0 });
    saveWorkspace('Mine');
    expect(isCustomArrangement()).toBe(false);
    expect(dock.get().user[0].rail?.[0].tools).toEqual(['hand']);
    moveToolTo('zoom', { newGroupAt: 0 });
    deleteWorkspace(ws.id);
    expect(dock.get().rails).toBeUndefined();
  });
  it('an exported workspace carries its arrangement (yours, or the one it brings), and imports with it', () => {
    applyWorkspace('animate');
    moveToolTo('hand', { newGroupAt: 0 });
    const text = JSON.parse(workspaceText('animate')!);
    expect(text.rail[0].tools).toEqual(['hand']);
    expect(text.layout.tools.groups).toBeUndefined();
    const r = importWorkspace(workspaceText('animate')!);
    expect(r.ok && r.workspace.rail?.[0].tools).toEqual(['hand']);
    applyWorkspace('pixel');
    expect(JSON.parse(workspaceText('pixel')!).rail.map((g: ToolGroup) => g.id).slice(0, 2)).toEqual(['draw', 'pixel']);
    // Exporting the one you are in, with no id.
    expect(JSON.parse(workspaceText()!).rail.map((g: ToolGroup) => g.id).slice(0, 2)).toEqual(['draw', 'pixel']);
  });
  it('a file with a made up rail is tidied', () => {
    const r = importWorkspace(JSON.stringify({ format: 'frameling-workspace', version: 1, name: 'Odd', layout: {}, rail: [{ id: '__proto__', tools: ['a'] }, { id: 'ok', tools: ['pencil', 'pencil', '../x'] }, 4] }));
    expect(r.ok && r.workspace.rail).toEqual([{ id: 'ok', tools: ['pencil'] }]);
  });
  it('a workspace saved before there was a rail has none and uses the standard order', () => {
    const r = importWorkspace(JSON.stringify({ format: 'frameling-workspace', version: 1, name: 'Old', layout: {} }));
    expect(r.ok && r.workspace.rail).toBeUndefined();
    expect(defaultRailOf(dock.get(), 'nope')).toBeUndefined();
    expect(railOf({ ...dock.get(), workspaceId: 'nope' })).toBeUndefined();
  });
});

describe('anchors', () => {
  it('sanitizeGroups keeps a group with no tools only when asked to', () => {
    expect(sanitizeGroups([{ id: 'a', tools: [] }])).toBeUndefined();
    expect(sanitizeGroups([{ id: 'a', tools: [] }], true)).toEqual([{ id: 'a', tools: [] }]);
  });
  it('an anchor group with no tools to hold is not shown', () => {
    const g = resolveGroups([{ id: 'rig', tools: [] }, { id: 'draw', tools: [] }], [{ id: 'pencil', group: 'draw', groupAt: 0 }]);
    expect(ids(g)).toEqual(['draw']);
  });
  it('an anchor order wins over the default order', () => {
    const g = resolveGroups([{ id: 'rig', tools: [] }, { id: 'draw', tools: [] }], [{ id: 'pencil', group: 'draw', groupAt: 0 }, { id: 'bone', group: 'rig', groupAt: 0 }]);
    expect(ids(g)).toEqual(['rig', 'draw']);
  });
});

describe('loading what an older version saved', () => {
  const old = (workspaceId: string, groups: unknown, extra: object = {}) =>
    localStorage.setItem(DOCK_KEY, JSON.stringify({ layout: { zones: {}, hidden: [], known: [], tools: { place: 'right', x: 1, y: 2, groups } }, workspaceId, user: [], ...extra }));
  const load = async () => {
    vi.resetModules();
    return import('../../src/ui/dock');
  };
  it('the one arrangement becomes your arrangement for the workspace you are on', async () => {
    old('animate', [{ id: 'g1', tools: ['hand', 'zoom'] }]);
    const m = await load();
    const s = m.dock.get();
    expect(s.workspaceId).toBe('animate');
    expect(s.rails).toEqual({ animate: [{ id: 'g1', tools: ['hand', 'zoom'] }] });
    expect(s.layout.tools.groups).toBeUndefined();
    expect(s.layout.tools.place).toBe('right');
    // The others start from their own defaults.
    m.applyWorkspace('pixel');
    expect(m.dock.get().rails?.pixel).toBeUndefined();
    expect(m.railOf(m.dock.get())).toEqual(BUILTIN_RAILS.pixel);
  });
  it('works for one of your own workspaces too, and keeps what its saved copy carried as its default', async () => {
    old('u-1', [{ id: 'g1', tools: ['hand'] }], { user: [{ id: 'u-1', name: 'Mine', layout: { zones: {}, hidden: [], known: [], tools: { place: 'left', x: 1, y: 2, groups: [{ id: 'g2', tools: ['zoom'] }] } } }] });
    const m = await load();
    expect(m.dock.get().rails?.['u-1']).toEqual([{ id: 'g1', tools: ['hand'] }]);
    expect(m.dock.get().user[0].rail).toEqual([{ id: 'g2', tools: ['zoom'] }]);
    expect(m.dock.get().user[0].layout.tools.groups).toBeUndefined();
  });
  it('a layout with no arrangement, and an arrangement already saved per workspace, both load as they are', async () => {
    old('draw', undefined);
    expect((await load()).dock.get().rails).toBeUndefined();
    old('draw', [{ id: 'g1', tools: ['hand'] }], { rails: { draw: [{ id: 'g9', tools: ['zoom'] }], '__proto__': [{ id: 'x', tools: ['pencil'] }], bad: 'x' } });
    const s = (await load()).dock.get();
    expect(s.rails).toEqual({ draw: [{ id: 'g9', tools: ['zoom'] }] });
  });
  it('tells the person once, by workspace name, that the arrangement stayed where they were', async () => {
    localStorage.removeItem('frameling.dock.railNote.v1');
    old('animate', [{ id: 'g1', tools: ['hand', 'zoom'] }]);
    const m = await load();
    expect(m.takeRailMigrationNote()).toBe('Animate');
    expect(m.takeRailMigrationNote()).toBeNull();
    // Remembered across restarts, even though the old arrangement was never written back.
    old('animate', [{ id: 'g1', tools: ['hand', 'zoom'] }]);
    expect((await load()).takeRailMigrationNote()).toBeNull();
  });
  it('names one of your own workspaces, and says nothing when there was nothing to move', async () => {
    localStorage.removeItem('frameling.dock.railNote.v1');
    old('u-1', [{ id: 'g1', tools: ['hand'] }], { user: [{ id: 'u-1', name: 'Mine', layout: { zones: {}, hidden: [], known: [], tools: { place: 'left', x: 1, y: 2 } } }] });
    expect((await load()).takeRailMigrationNote()).toBe('Mine');
    localStorage.removeItem('frameling.dock.railNote.v1');
    old('draw', undefined);
    expect((await load()).takeRailMigrationNote()).toBeNull();
    old('draw', [{ id: 'g1', tools: ['hand'] }], { rails: { draw: [{ id: 'g9', tools: ['zoom'] }] } });
    expect((await load()).takeRailMigrationNote()).toBeNull();
  });
  it('the note is a Quill line with the workspace filled in', () => {
    expect(line('workspaces.railKept', { workspace: 'Animate' })).toBe('Your tool arrangement stays in Animate. Other workspaces now start from their own.');
  });
  it('the arrangement is written out with the workspace id and read back', async () => {
    moveToolTo('hand', { newGroupAt: 0 });
    const raw = JSON.parse(localStorage.getItem(DOCK_KEY)!);
    expect(raw.rails.draw[0].tools).toEqual(['hand']);
    expect(raw.layout.tools.groups).toBeUndefined();
    const m = await load();
    expect(m.dock.get().rails?.draw[0].tools).toEqual(['hand']);
  });
});
