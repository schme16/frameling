// The Change the tools model: put away, fold, divide, join, headings, and what it does to twins. All pure.
import { describe, expect, it } from 'vitest';
import { awayPlaces, canJoinAbove, foldGroup, hasBuilderChanges, headingOf, hiddenTools, hideTool, joinGroupAbove, moveTool, railFor, resolveGroups, showAllTools, showTool, slotMates, startGroupAt, type RailTool, type ToolGroup } from '../../src/ui/toolArrange';

const G = (): ToolGroup[] => [
  { id: 'draw', tools: ['pencil', 'brush', 'eraser'] },
  { id: 'shapes', name: 'Blocking', tools: ['line', 'rect'] },
  { id: 'g4', tools: ['star'] },
];
const pair = slotMates([{ id: 'lasso', slot: 's' }, { id: 'pixel-lasso', slot: 's' }, { id: 'pencil' }]);
const flat = (g: ToolGroup[]) => g.flatMap((x) => x.tools).sort();

describe('putting a tool away', () => {
  it('keeps it in its group and lists it as hidden', () => {
    const g = hideTool(G(), 'brush');
    expect(g[0]).toEqual({ id: 'draw', tools: ['pencil', 'brush', 'eraser'], hidden: ['brush'] });
    expect(hiddenTools(g)).toEqual(['brush']);
    expect(flat(g)).toEqual(flat(G()));
  });
  it('is a no-op the second time, and for a tool that is not there', () => {
    const g = hideTool(G(), 'brush');
    expect(hideTool(g, 'brush')).toBe(g);
    expect(hideTool(G(), 'nope').length).toBe(3);
  });
  it('twins go and come back as one', () => {
    const base: ToolGroup[] = [{ id: 'a', tools: ['lasso', 'pixel-lasso', 'pencil'] }];
    const g = hideTool(base, 'pixel-lasso', pair);
    expect(g[0].hidden).toEqual(['lasso', 'pixel-lasso']);
    expect(awayPlaces(g, pair)).toEqual(['lasso']);
    expect(showTool(g, 'lasso', pair)[0].hidden).toBeUndefined();
  });
  it('brings one back, or every one', () => {
    const g = hideTool(hideTool(G(), 'brush'), 'rect');
    expect(showTool(g, 'brush')[0].hidden).toBeUndefined();
    expect(hiddenTools(showTool(g, 'brush'))).toEqual(['rect']);
    expect(hasBuilderChanges(showAllTools(g))).toBe(false);
    expect(showAllTools(G())).toEqual(G());
  });
  it('a tool moved from the shelf shows again where it lands, and nothing ends up in two places', () => {
    const g = moveTool(hideTool(G(), 'brush'), 'brush', { group: 'shapes', before: 'rect' });
    expect(hiddenTools(g)).toEqual([]);
    expect(g[1].tools).toEqual(['line', 'brush', 'rect']);
    expect(flat(g)).toEqual(flat(G()));
  });
  it('a hidden tool dropped where it already is still comes back', () => {
    const g = moveTool(hideTool(G(), 'brush'), 'brush', { group: 'draw', before: 'eraser' });
    expect(hiddenTools(g)).toEqual([]);
  });
  it('a lone hidden tool dropped next to itself comes back too', () => {
    const g = moveTool(hideTool(G(), 'star'), 'star', { newGroupAt: 3 });
    expect(hiddenTools(g)).toEqual([]);
  });
});

describe('resolving keeps the hidden list honest', () => {
  const refs = ['pencil', 'brush', 'eraser', 'line', 'rect', 'star'].map((id) => ({ id }));
  it('drops hidden tools that no longer exist', () => {
    const g = resolveGroups([{ id: 'draw', tools: ['pencil', 'gone'], hidden: ['gone', 'pencil'] }], refs);
    expect(g.find((x) => x.id === 'draw')?.hidden).toEqual(['pencil']);
  });
  it('hides the whole of a slot when one of it is hidden', () => {
    const tools = [{ id: 'lasso', slot: 's' }, { id: 'pixel-lasso', slot: 's' }];
    const g = resolveGroups([{ id: 'a', tools: ['lasso', 'pixel-lasso'], hidden: ['lasso'] }], tools);
    expect(g[0].hidden).toEqual(['lasso', 'pixel-lasso']);
  });
  it('keeps fold', () => {
    expect(resolveGroups([{ id: 'a', tools: ['pencil'], fold: true }], refs).find((x) => x.id === 'a')?.fold).toBe(true);
  });
});

describe('folding', () => {
  it('folds and opens a group, and says nothing changed when it did not', () => {
    const g = foldGroup(G(), 'shapes', true);
    expect(g[1].fold).toBe(true);
    expect(foldGroup(g, 'shapes', true)).toBe(g);
    expect(foldGroup(g, 'shapes', false)[1]).toEqual(G()[1]);
    expect(foldGroup(G(), 'nope', true).length).toBe(3);
  });
});

describe('dividers', () => {
  it('start a group at a tool: it and the rest of its group, after it', () => {
    const g = startGroupAt(G(), 'brush');
    expect(g.map((x) => x.tools)).toEqual([['pencil'], ['brush', 'eraser'], ['line', 'rect'], ['star']]);
    expect(g[1].name).toBeUndefined();
    expect(headingOf(g[1], g)).toBeUndefined();
    expect(flat(g)).toEqual(flat(G()));
  });
  it('does nothing at the first tool of a group', () => {
    const g = G();
    expect(startGroupAt(g, 'pencil')).toBe(g);
  });
  it('never splits a pair that share a place', () => {
    const base: ToolGroup[] = [{ id: 'a', tools: ['pencil', 'lasso', 'pixel-lasso', 'x'] }];
    const g = startGroupAt(base, 'pixel-lasso', pair);
    expect(g.map((x) => x.tools)).toEqual([['pencil'], ['lasso', 'pixel-lasso', 'x']]);
  });
  it('split and join the hidden tools along with the others', () => {
    const g = startGroupAt(hideTool(G(), 'eraser'), 'brush');
    expect(g[0].hidden).toBeUndefined();
    expect(g[1].hidden).toEqual(['eraser']);
    const back = joinGroupAbove(g, g[1].id);
    expect(back[0].tools).toEqual(['pencil', 'brush', 'eraser']);
    expect(back[0].hidden).toEqual(['eraser']);
  });
  it('join the group above, or a group further up, and the first group has none above', () => {
    expect(joinGroupAbove(G(), 'shapes').map((x) => x.tools)).toEqual([['pencil', 'brush', 'eraser', 'line', 'rect'], ['star']]);
    expect(joinGroupAbove(G(), 'g4', 'draw').map((x) => x.tools)).toEqual([['pencil', 'brush', 'eraser', 'star'], ['line', 'rect']]);
    const g = G();
    expect(joinGroupAbove(g, 'draw')).toBe(g);
    expect(canJoinAbove(g, 'draw')).toBe(false);
    expect(canJoinAbove(g, 'shapes')).toBe(true);
  });
  it('a joined group keeps the name and fold of the one above', () => {
    const g = joinGroupAbove(foldGroup(G(), 'draw', true), 'shapes');
    expect(g[0].fold).toBe(true);
    expect(g[0].name).toBeUndefined();
  });
});

describe('headings', () => {
  it('the usual groups and the ones you named have one; a group you made and never named is a divider', () => {
    const g = G();
    expect(headingOf(g[0], g)).toBe('Draw');
    expect(headingOf(g[1], g)).toBe('Blocking');
    expect(headingOf(g[2], g)).toBeUndefined();
  });
});

describe('tools that do not work on the layer', () => {
  const CAST: RailTool[] = [
    { id: 'pencil', layers: ['vector', 'pixel'] },
    { id: 'shade', layers: ['pixel'] },
    { id: 'text', layers: ['vector'] },
    { id: 'lasso', slot: 'l', layers: ['vector'] },
    { id: 'pixel-lasso', slot: 'l', layers: ['pixel'] },
  ];
  it('are left out when asked, and the places that remain keep their order', () => {
    const grey = railFor(CAST, 'vector');
    const hide = railFor(CAST, 'vector', undefined, false);
    expect(hide.off).toEqual([]);
    expect(hide.shown).toEqual(grey.shown.filter((id) => !grey.off.includes(id)));
    expect(hide.shown).toEqual(['pencil', 'text', 'lasso']);
    expect(railFor(CAST, 'pixel', undefined, false).shown).toEqual(['pencil', 'shade', 'pixel-lasso']);
  });
  it('twins still share one button, the one for the layer', () => {
    expect(railFor(CAST, 'pixel', undefined, false).shown.filter((id) => id.includes('lasso'))).toEqual(['pixel-lasso']);
  });
  it('the greyed rail is as it was', () => {
    expect(railFor(CAST, 'vector').off).toEqual(['shade']);
  });
});
