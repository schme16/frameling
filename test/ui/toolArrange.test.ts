// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { currentGroups } from '../../src/ui/toolRail';
import { applyWorkspace, dock, resetDock, saveWorkspace, setToolGroups, workspaceText, importWorkspace, placeTools } from '../../src/ui/dock';
import { normaliseLayout, sanitizeWorkspace, emptyLayout } from '../../src/ui/dockModel';
import { DEFAULT_GROUPS, groupName, moveTool, placeWords, resolveGroups, sanitizeGroups, shiftTool, visibleGroups, type ToolGroup } from '../../src/ui/toolArrange';

// Where the built-in tools start in the rail (each registers its own `group` and `groupAt`; the last test checks they agree).
const PLACES: Record<string, string[]> = {
  draw: ['pencil', 'brush', 'eraser', 'fill', 'tile-brush', 'tile-eraser', 'tile-fill'],
  extras: ['shade', 'dither', 'gradient', 'eyedropper', 'tile-picker', 'spray'],
  shapes: ['line', 'rect', 'ellipse', 'polygon', 'star', 'tile-rect', 'text'],
  // Each way of picking is its own tool, vector and pixel side by side at the same place in the group.
  select: ['select', 'pixel-select', 'select-lasso', 'pixel-select-lasso', 'select-polygon', 'pixel-select-polygon', 'select-magnetic', 'pixel-select-magnetic', 'pixel-select-wand', 'transform', 'points', 'pen', 'slice'],
  rig: ['bone', 'pose', 'weights', 'motion-path', 'shape-hints'],
  view: ['hand', 'zoom', 'camera', 'artboard'],
};
const refs = (ids: string[]) =>
  ids.map((id) => {
    const group = Object.keys(PLACES).find((g) => PLACES[g].includes(id));
    return group ? { id, group, groupAt: PLACES[group].indexOf(id) } : { id };
  });
const resolve = (saved: ToolGroup[] | undefined, ids: string[]) => resolveGroups(saved, refs(ids));

const VECTOR = ['pencil', 'brush', 'eraser', 'fill', 'gradient', 'eyedropper', 'line', 'rect', 'ellipse', 'polygon', 'star', 'text', 'select', 'points', 'pen', 'bone', 'pose', 'hand', 'zoom'];
const flat = (g: ToolGroup[]) => g.flatMap((x) => x.tools);
const names = (g: ToolGroup[]) => g.map((x) => x.id);

describe('the default arrangement', () => {
  it('groups the real tools: drawing, extras, shapes, select and pen, rig, view', () => {
    const g = resolve(undefined, VECTOR);
    expect(names(g)).toEqual(['draw', 'extras', 'shapes', 'select', 'rig', 'view']);
    expect(g[0].tools).toEqual(['pencil', 'brush', 'eraser', 'fill']);
    expect(g[2].tools).toEqual(['line', 'rect', 'ellipse', 'polygon', 'star', 'text']);
    expect(g[5].tools).toEqual(['hand', 'zoom']);
  });
  it('puts every tool exactly once, wherever it was registered from', () => {
    const g = resolve(undefined, [...VECTOR].reverse());
    expect([...flat(g)].sort()).toEqual([...VECTOR].sort());
  });
  it('names every default group in the list', () => {
    for (const d of DEFAULT_GROUPS) expect(groupName({ id: d.id, tools: [] }, [])).toBe(d.name);
  });
});

describe('the tools the app registers', () => {
  it('start in the groups and places the rail always had', async () => {
    await import('../../src/renderer/features');
    const { allTools } = await import('../../src/core/registry');
    const g = resolveGroups(undefined, allTools());
    expect(names(g)).toEqual(['draw', 'extras', 'shapes', 'select', 'rig', 'view']);
    for (const group of g) expect(group.tools).toEqual(PLACES[group.id]);
  });
});

describe('plugin tools', () => {
  it('unknown tools go in Other at the end and are never dropped', () => {
    const g = resolve(undefined, [...VECTOR, 'plugin-laser', 'plugin-stamp']);
    expect(names(g).at(-1)).toBe('other');
    expect(g.at(-1)!.tools).toEqual(['plugin-laser', 'plugin-stamp']);
    expect(groupName(g.at(-1)!, g)).toBe('Other');
  });
  it('a tool added after the arrangement was saved joins its default group, and keeps the saved order', () => {
    const saved: ToolGroup[] = [{ id: 'draw', tools: ['brush', 'pencil'] }, { id: 'view', tools: ['zoom', 'hand'] }];
    const g = resolve(saved, ['pencil', 'brush', 'eraser', 'hand', 'zoom', 'plugin-x']);
    expect(g[0].tools).toEqual(['brush', 'pencil', 'eraser']);
    expect(g[1].tools).toEqual(['zoom', 'hand']);
    expect(g[2]).toMatchObject({ id: 'other', tools: ['plugin-x'] });
  });
  it('a default group the person emptied away comes back in its place when a tool of it is new', () => {
    const saved: ToolGroup[] = [{ id: 'draw', tools: ['pencil'] }, { id: 'view', tools: ['hand'] }];
    const g = resolve(saved, ['pencil', 'hand', 'line']);
    expect(names(g)).toEqual(['draw', 'shapes', 'view']);
  });
  it('tools that no longer exist are dropped from the saved arrangement, and empty groups with them', () => {
    const saved: ToolGroup[] = [{ id: 'g1', tools: ['gone'] }, { id: 'draw', tools: ['pencil', 'gone2'] }];
    const g = resolve(saved, ['pencil']);
    expect(g).toEqual([{ id: 'draw', tools: ['pencil'] }]);
  });
});

describe('moving tools', () => {
  const base = () => resolve(undefined, VECTOR);
  it('within a group: before another tool, or to the end', () => {
    const a = moveTool(base(), 'fill', { group: 'draw', before: 'pencil' });
    expect(a[0].tools).toEqual(['fill', 'pencil', 'brush', 'eraser']);
    const b = moveTool(base(), 'pencil', { group: 'draw', before: null });
    expect(b[0].tools).toEqual(['brush', 'eraser', 'fill', 'pencil']);
  });
  it('into another group', () => {
    const a = moveTool(base(), 'pencil', { group: 'shapes', before: 'rect' });
    expect(a[0].tools).toEqual(['brush', 'eraser', 'fill']);
    expect(a[2].tools.slice(0, 3)).toEqual(['line', 'pencil', 'rect']);
  });
  it('into a group of its own, anywhere among the groups', () => {
    const a = moveTool(base(), 'text', { newGroupAt: 1 });
    expect(a).toHaveLength(7);
    expect(a[1].tools).toEqual(['text']);
    expect(a[1].id).toBe('g7');
    expect(a.find((g) => g.id === 'shapes')!.tools).not.toContain('text');
    expect(flat(a).sort()).toEqual([...VECTOR].sort());
  });
  it('a group left empty goes away', () => {
    const a = moveTool(base(), 'zoom', { group: 'view', before: null });
    expect(a).toEqual(base());
    const lone = resolve([{ id: 'g1', tools: ['hand'] }, { id: 'draw', tools: ['pencil'] }], ['hand', 'pencil']);
    const b = moveTool(lone, 'hand', { group: 'draw' });
    expect(names(b)).toEqual(['draw']);
    expect(b[0].tools).toEqual(['pencil', 'hand']);
  });
  it('changes nothing (the same object back) when the move is a no-op', () => {
    const g = base();
    expect(moveTool(g, 'pencil', { group: 'draw', before: 'pencil' })).toBe(g);
    expect(moveTool(g, 'brush', { group: 'draw', before: 'eraser' })).toBe(g);
    expect(moveTool(g, 'unknown', { group: 'draw' })).toBe(g);
    expect(moveTool(g, 'pencil', { group: 'nope' })).toBe(g);
    const lone = resolve([{ id: 'g1', tools: ['hand'] }, { id: 'draw', tools: ['pencil'] }], ['hand', 'pencil']);
    expect(moveTool(lone, 'hand', { newGroupAt: 0 })).toBe(lone);
    expect(moveTool(lone, 'hand', { newGroupAt: 1 })).toBe(lone);
  });
  it('does not change the list it was given', () => {
    const g = base();
    const before = JSON.stringify(g);
    moveTool(g, 'pencil', { group: 'view' });
    expect(JSON.stringify(g)).toBe(before);
  });
});

describe('keyboard steps', () => {
  const base = () => resolve(undefined, VECTOR);
  it('one place later or earlier in the group', () => {
    expect(shiftTool(base(), 'pencil', 1)[0].tools).toEqual(['brush', 'pencil', 'eraser', 'fill']);
    expect(shiftTool(base(), 'fill', -2)[0].tools).toEqual(['pencil', 'fill', 'brush', 'eraser']);
  });
  it('crosses into the next group past the end, and the previous group past the start', () => {
    const a = shiftTool(base(), 'fill', 1);
    expect(a[0].tools).toEqual(['pencil', 'brush', 'eraser']);
    expect(a[1].tools[0]).toBe('fill');
    const b = shiftTool(base(), 'gradient', -1);
    expect(b[0].tools.at(-1)).toBe('gradient');
  });
  it('stops at the very start and end', () => {
    const g = base();
    expect(shiftTool(g, 'pencil', -1)).toBe(g);
    expect(shiftTool(g, 'zoom', 1)).toBe(g);
  });
  it('steps over tools that are not showing', () => {
    const g = base();
    const shows = (id: string) => id !== 'brush';
    expect(shiftTool(g, 'pencil', 1, shows)[0].tools).toEqual(['brush', 'eraser', 'pencil', 'fill']);
  });
  it('says where a tool is', () => {
    expect(placeWords(base(), 'brush')).toBe('Draw, place 2 of 4');
  });
});

describe('what shows', () => {
  it('hides tools that do not work here and groups that end up empty', () => {
    const g = visibleGroups(resolve(undefined, VECTOR), (id) => ['hand', 'zoom', 'pencil'].includes(id));
    expect(g.map((x) => x.tools)).toEqual([['pencil'], ['hand', 'zoom']]);
  });
});

describe('saved arrangements', () => {
  it('sanitize: drops bad ids, repeats and empty groups, caps names', () => {
    const g = sanitizeGroups([
      { id: 'a', name: '  Mine\u0007 ', tools: ['pencil', 'pencil', '../x', 7, '__proto__'] },
      { id: 'a', tools: ['brush'] },
      { id: 'b', tools: ['pencil', 'brush'] },
      { id: 'c', tools: [] },
      'nope',
    ]);
    expect(g).toEqual([{ id: 'a', name: 'Mine', tools: ['pencil'] }, { id: 'b', tools: ['brush'] }]);
    expect(sanitizeGroups(undefined)).toBeUndefined();
    expect(sanitizeGroups([])).toBeUndefined();
    expect(sanitizeGroups('x')).toBeUndefined();
  });
  it('an older layout without one loads fine and uses the default', () => {
    const l = normaliseLayout({ zones: {}, tools: { place: 'right', x: 5, y: 6 } });
    expect(l.tools.groups).toBeUndefined();
    expect(l.tools.place).toBe('right');
    expect(normaliseLayout(undefined).tools.groups).toBeUndefined();
  });
  it('is kept by the layout, and by moving the rail', () => {
    const l = normaliseLayout({ ...emptyLayout(), tools: { place: 'left', x: 1, y: 2, groups: [{ id: 'g1', tools: ['pencil', 'brush'] }] } });
    expect(l.tools.groups).toEqual([{ id: 'g1', tools: ['pencil', 'brush'] }]);
  });
});

describe('with the workspace', () => {
  beforeAll(async () => {
    await import('../../src/renderer/features');
  });
  beforeEach(() => resetDock());
  const mine: ToolGroup[] = [{ id: 'g1', tools: ['brush', 'pencil'] }];
  it('is kept for the workspace it was made in, survives moving the rail, and comes back with the workspace', () => {
    setToolGroups(mine);
    placeTools('right');
    expect(dock.get().rails?.draw).toEqual(mine);
    const ws = saveWorkspace('Mine')!;
    // Saving makes it the workspace's own default.
    expect(ws.rail).toEqual(mine);
    expect(dock.get().rails?.[ws.id]).toBeUndefined();
    applyWorkspace('animate');
    applyWorkspace(ws.id);
    expect(currentGroups().find((g) => g.id === 'g1')?.tools).toEqual(['brush', 'pencil']);
  });
  it('goes with an exported workspace and arrives on import', () => {
    setToolGroups([{ id: 'g1', name: 'Faves', tools: ['brush'] }]);
    const ws = saveWorkspace('Shared')!;
    const text = workspaceText(ws.id)!;
    expect(text).toContain('Faves');
    expect(JSON.parse(text).rail).toEqual([{ id: 'g1', name: 'Faves', tools: ['brush'] }]);
    expect(JSON.parse(text).layout.tools.groups).toBeUndefined();
    const r = importWorkspace(text);
    expect(r.ok).toBe(true);
    expect(r.ok && r.workspace.rail).toEqual([{ id: 'g1', name: 'Faves', tools: ['brush'] }]);
  });
  it('an older file that carried the arrangement in its layout still brings it', () => {
    const l = { ...emptyLayout(), tools: { place: 'left', x: 1, y: 2, groups: [{ id: 'g1', tools: ['brush'] }] } };
    const ws = sanitizeWorkspace({ id: 'x', name: 'x', layout: l })!;
    expect(ws.rail).toEqual([{ id: 'g1', tools: ['brush'] }]);
    expect(ws.layout.tools.groups).toBeUndefined();
  });
});
