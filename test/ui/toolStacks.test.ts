// Tools that share one rail button: the pure rules (which tools stack, what the button shows, what stays on a layer that cannot use
// them) and how a stack lives in an arrangement (kept when saved, dissolved when a move breaks it, never forced on a rail someone arranged).
import { describe, expect, it } from 'vitest';
import { placeBeside } from '../../src/ui/placePopup';
import { resolveGroups, sanitizeGroups, visibleGroups, type ToolGroup } from '../../src/ui/toolArrange';
import { cleanStacks, defaultStacks, frontOfUnit, greyedInStacks, railUnits, stackName, visibleStack, withoutStack, type ToolStack } from '../../src/ui/toolStacks';

const brush: ToolStack = { id: 'brush', tools: ['brush', 'soft-brush', 'airbrush'] };

describe('which tools stack by default', () => {
  const stackOf = (id: string) => ({ brush: 'brush', 'soft-brush': 'brush', airbrush: 'brush', eraser: 'eraser', 'soft-eraser': 'eraser' }[id]);
  it('a run of tools next to each other that name the same stack', () => {
    expect(defaultStacks(['pencil', 'brush', 'soft-brush', 'airbrush', 'eraser', 'soft-eraser', 'fill'], stackOf)).toEqual([
      { id: 'brush', tools: ['brush', 'soft-brush', 'airbrush'] },
      { id: 'eraser', tools: ['eraser', 'soft-eraser'] },
    ]);
  });
  it('one tool alone is just a tool, and the same stack split by another tool is two runs', () => {
    expect(defaultStacks(['pencil', 'brush', 'fill'], stackOf)).toEqual([]);
    expect(defaultStacks(['brush', 'soft-brush', 'fill', 'airbrush'], stackOf)).toEqual([{ id: 'brush', tools: ['brush', 'soft-brush'] }]);
  });
});

describe('stacks that hold up', () => {
  it('keeps a stack whose tools are next to each other', () => {
    expect(cleanStacks(['pencil', 'brush', 'soft-brush', 'airbrush', 'fill'], [brush])).toEqual([brush]);
  });
  it('drops one a move broke up, one with a tool the group no longer has, and one with a single tool', () => {
    expect(cleanStacks(['brush', 'fill', 'soft-brush', 'airbrush'], [brush])).toEqual([]);
    expect(cleanStacks(['brush', 'soft-brush'], [brush])).toEqual([]);
    expect(cleanStacks(['brush', 'soft-brush'], [{ id: 'x', tools: ['brush'] }])).toEqual([]);
  });
  it('puts the tools in the order the group has them, and keeps a tool in one stack only', () => {
    expect(cleanStacks(['airbrush', 'brush', 'soft-brush'], [brush])).toEqual([{ id: 'brush', tools: ['airbrush', 'brush', 'soft-brush'] }]);
    expect(cleanStacks(['brush', 'soft-brush', 'airbrush'], [{ id: 'a', tools: ['brush', 'soft-brush'] }, { id: 'b', tools: ['soft-brush', 'airbrush'] }])).toEqual([{ id: 'a', tools: ['brush', 'soft-brush'] }]);
  });
  it('shows only the tools that show, and nothing when fewer than two are left', () => {
    expect(visibleStack(brush, (t) => t !== 'airbrush')).toEqual({ id: 'brush', tools: ['brush', 'soft-brush'] });
    expect(visibleStack(brush, (t) => t === 'brush')).toBeNull();
  });
  it('a stack taken apart leaves the others', () => {
    expect(withoutStack([brush, { id: 'eraser', tools: ['eraser', 'soft-eraser'] }], 'brush')).toEqual([{ id: 'eraser', tools: ['eraser', 'soft-eraser'] }]);
  });
  it('has a name for the stacks that come with the app', () => {
    expect(stackName('brush')).toBe('Brushes');
    expect(stackName('eraser')).toBe('Erasers');
    expect(stackName('retouch')).toBe('Retouch');
  });
});

describe('the places on a rail', () => {
  const tools = ['pencil', 'brush', 'soft-brush', 'airbrush', 'fill'];
  it('a stack takes the place of its first tool', () => {
    expect(railUnits(tools, [brush])).toEqual([
      { id: 'pencil', tools: ['pencil'], stack: false },
      { id: 'brush', tools: ['brush', 'soft-brush', 'airbrush'], stack: true },
      { id: 'fill', tools: ['fill'], stack: false },
    ]);
  });
  it('with sharing off every tool is a place of its own', () => {
    expect(railUnits(tools, [brush], false).map((u) => u.id)).toEqual(tools);
  });
  it('a stack with one tool showing is just that tool', () => {
    expect(railUnits(['pencil', 'brush', 'fill'], [brush])).toEqual([
      { id: 'pencil', tools: ['pencil'], stack: false },
      { id: 'brush', tools: ['brush'], stack: false },
      { id: 'fill', tools: ['fill'], stack: false },
    ]);
  });
});

describe('what a stack button shows', () => {
  const unit = { tools: ['brush', 'soft-brush', 'airbrush'] };
  const none = new Set<string>();
  it('the tool in use, when it is in the stack', () => {
    expect(frontOfUnit(unit, { current: 'airbrush', remembered: 'soft-brush', off: none })).toBe('airbrush');
  });
  it('else the one used last from it', () => {
    expect(frontOfUnit(unit, { current: 'fill', remembered: 'soft-brush', off: none })).toBe('soft-brush');
  });
  it('else the first', () => {
    expect(frontOfUnit(unit, { current: 'fill', off: none })).toBe('brush');
  });
  it('skips what this layer cannot use, unless nothing works', () => {
    expect(frontOfUnit(unit, { current: 'fill', remembered: 'soft-brush', off: new Set(['soft-brush', 'brush']) })).toBe('airbrush');
    expect(frontOfUnit(unit, { current: 'fill', off: new Set(unit.tools) })).toBe('brush');
  });
  it('with clicks that go to the first, always the first that works', () => {
    expect(frontOfUnit(unit, { current: 'airbrush', remembered: 'airbrush', off: none, click: 'first' })).toBe('brush');
    expect(frontOfUnit(unit, { current: 'airbrush', off: new Set(['brush']), click: 'first' })).toBe('soft-brush');
  });
});

describe('what a layer leaves in a stack', () => {
  const stacks: ToolStack[] = [{ id: 'brush', tools: ['brush', 'soft-brush'] }, { id: 'retouch', tools: ['smudge', 'blur-brush'] }];
  const pool = new Set(['brush', 'soft-brush', 'smudge', 'blur-brush', 'fill']);
  it('the tools hidden because of the layer stay, greyed, in their stack (the Retouch button stays too)', () => {
    expect(greyedInStacks(stacks, new Set(['brush', 'fill']), pool)).toEqual(['soft-brush', 'smudge', 'blur-brush']);
  });
  it('nothing is added when every tool of the stack already shows', () => {
    expect(greyedInStacks(stacks, new Set(pool), pool)).toEqual([]);
  });
  it('a tool that is not on this rail at all (another workspace) is not brought in', () => {
    expect(greyedInStacks(stacks, new Set(['brush']), new Set(['brush', 'smudge']))).toEqual(['smudge']);
  });
});

describe('stacks in an arrangement', () => {
  const refs = [
    { id: 'pencil', group: 'draw', groupAt: 0 },
    { id: 'brush', group: 'draw', groupAt: 1, stack: 'brush' },
    { id: 'soft-brush', group: 'draw', groupAt: 1.1, stack: 'brush' },
    { id: 'eraser', group: 'draw', groupAt: 2, stack: 'eraser' },
    { id: 'soft-eraser', group: 'draw', groupAt: 2.1, stack: 'eraser' },
    { id: 'fill', group: 'draw', groupAt: 3 },
    { id: 'smudge', group: 'retouch', groupAt: 0, stack: 'retouch' },
    { id: 'blur-brush', group: 'retouch', groupAt: 1, stack: 'retouch' },
  ];
  it('a rail that starts fresh stacks the tools that name a stack', () => {
    const g = resolveGroups(undefined, refs);
    expect(g.find((x) => x.id === 'draw')!.stacks).toEqual([{ id: 'brush', tools: ['brush', 'soft-brush'] }, { id: 'eraser', tools: ['eraser', 'soft-eraser'] }]);
    expect(g.find((x) => x.id === 'retouch')!.stacks).toEqual([{ id: 'retouch', tools: ['smudge', 'blur-brush'] }]);
  });
  it('a rail someone saved keeps just what it was saved with: no stacks are made for them', () => {
    const saved: ToolGroup[] = [{ id: 'draw', tools: ['pencil', 'brush', 'eraser', 'fill'] }, { id: 'extras', tools: ['soft-brush', 'soft-eraser', 'smudge', 'blur-brush'] }];
    const g = resolveGroups(saved, refs);
    expect(g.map((x) => [x.id, x.tools])).toEqual([['draw', ['pencil', 'brush', 'eraser', 'fill']], ['extras', ['soft-brush', 'soft-eraser', 'smudge', 'blur-brush']]]);
    expect(g.some((x) => x.stacks)).toBe(false);
  });
  it('stacks are saved with the rail and read back, and a stack a move broke is dropped', () => {
    const g = resolveGroups(undefined, refs);
    const back = resolveGroups(sanitizeGroups(JSON.parse(JSON.stringify(g))), refs);
    expect(back).toEqual(g);
    const broken: ToolGroup[] = g.map((x) => (x.id === 'draw' ? { ...x, tools: ['brush', 'pencil', 'soft-brush', 'eraser', 'soft-eraser', 'fill'] } : x));
    expect(resolveGroups(broken, refs).find((x) => x.id === 'draw')!.stacks).toEqual([{ id: 'eraser', tools: ['eraser', 'soft-eraser'] }]);
  });
  it('bad stacks in a saved file are ignored', () => {
    const raw = [{ id: 'draw', tools: ['brush', 'soft-brush'], stacks: [{ id: 'x', tools: 'nope' }, 7, { id: '../..', tools: ['brush', 'soft-brush'] }] }];
    expect(sanitizeGroups(raw)).toEqual([{ id: 'draw', tools: ['brush', 'soft-brush'] }]);
  });
  it('only the tools that show are in the stacks of the visible rail', () => {
    const g = resolveGroups(undefined, refs);
    const v = visibleGroups(g, (t) => t !== 'soft-brush');
    expect(v.find((x) => x.id === 'draw')!.stacks).toEqual([{ id: 'eraser', tools: ['eraser', 'soft-eraser'] }]);
  });
});

describe('where a pull-out goes beside a button', () => {
  const win = { w: 1000, h: 700 };
  it('beside the button, level with its top', () => {
    const p = placeBeside({ anchor: { left: 10, top: 200, right: 50, bottom: 240 }, win, width: 200, height: 300, prefer: 'right' });
    expect(p).toMatchObject({ left: 56, top: 200, side: 'right' });
  });
  it('moves up when it would run off the bottom, and scrolls inside when it is taller than the window', () => {
    const low = placeBeside({ anchor: { left: 10, top: 600, right: 50, bottom: 640 }, win, width: 200, height: 300, prefer: 'right' });
    expect(low.top + 300).toBeLessThanOrEqual(700 - 8);
    const tall = placeBeside({ anchor: { left: 10, top: 300, right: 50, bottom: 340 }, win, width: 200, height: 2000, prefer: 'right' });
    expect(tall).toMatchObject({ top: 8, maxHeight: 684 });
  });
  it('takes the other side when there is no room on the one it prefers', () => {
    const p = placeBeside({ anchor: { left: 900, top: 100, right: 940, bottom: 140 }, win, width: 200, height: 100, prefer: 'right' });
    expect(p.side).toBe('left');
    expect(p.left).toBe(900 - 6 - 200);
    const q = placeBeside({ anchor: { left: 20, top: 100, right: 60, bottom: 140 }, win, width: 200, height: 100, prefer: 'left' });
    expect(q.side).toBe('right');
  });
  it('stays inside the window on a window narrower than it', () => {
    const p = placeBeside({ anchor: { left: 10, top: 100, right: 50, bottom: 140 }, win: { w: 150, h: 400 }, width: 200, height: 100, prefer: 'right' });
    expect(p.left).toBeGreaterThanOrEqual(8);
    expect(p.left + p.width).toBeLessThanOrEqual(150 - 8);
  });
});
