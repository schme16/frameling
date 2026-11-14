// Stacked tab groups in a zone: the model (splitting, joining, moving between groups, empty groups going), old layouts
// reading as one group, shares, workspace files carrying the stacks, and the keyboard resize of a window's box.
import { describe, expect, it } from 'vitest';
import {
  activeOfGroup,
  closePanel,
  emptyLayout,
  evenSplit,
  frontPanel,
  groupCount,
  groupsOf,
  joinAllGroups,
  joinGroupUp,
  locate,
  MAX_GROUPS,
  MIN_SHARE,
  moveGroupTo,
  movePanelTo,
  normaliseLayout,
  nudgeSplit,
  placedIds,
  resizeBox,
  retainTabs,
  sanitizeWorkspace,
  setGroups,
  sharesOf,
  splitGroupsAt,
  stackPanels,
  zoneTabs,
  type Layout,
} from '../../src/ui/dockModel';
import { parseWorkspaceText, workspaceToText } from '../../src/ui/workspaceFile';

function sample(): Layout {
  const l = emptyLayout();
  l.zones.right = { tabs: ['layers', 'library', 'help'], active: 'layers', size: 316, collapsed: false };
  l.zones.bottom = { tabs: ['timeline'], active: 'timeline', size: 230, collapsed: false };
  l.known = ['layers', 'library', 'help', 'timeline', 'colours'];
  l.hidden = ['colours'];
  return l;
}
const rightTabs = (l: Layout) => groupsOf(l.zones.right).map((g) => g.tabs);
const sum = (n: number[]) => n.reduce((a, b) => a + b, 0);

describe('old layouts', () => {
  it('load as one group per zone, with no stack fields', () => {
    const n = normaliseLayout({ zones: { right: { tabs: ['layers', 'help'], active: 'help', size: 300, collapsed: false } }, known: [] });
    expect(groupCount(n.zones.right)).toBe(1);
    expect(n.zones.right.more).toBeUndefined();
    expect(n.zones.right.shares).toBeUndefined();
    expect(n.zones.right.tabs).toEqual(['layers', 'help']);
    expect(sharesOf(n.zones.right)).toEqual([1]);
  });

  it('keep stacked groups through a save and load, with the shares', () => {
    const l = movePanelTo(sample(), 'help', { zone: 'right', group: 0, split: 'after' });
    const back = normaliseLayout(JSON.parse(JSON.stringify(l)));
    expect(rightTabs(back)).toEqual([['layers', 'library'], ['help']]);
    expect(back.zones.right.shares).toEqual([0.5, 0.5]);
    expect(activeOfGroup(back, 'right', 1)).toBe('help');
  });

  it('tidy bad stacks: empty groups and repeats dropped, shares made to add up, extras capped', () => {
    const n = normaliseLayout({
      zones: { right: { tabs: ['a'], active: 'a', size: 300, collapsed: false, more: [{ tabs: [] }, { tabs: ['a', 'b'], active: 'zzz' }, 7, { tabs: ['c'] }, { tabs: ['d'] }, { tabs: ['e'] }], shares: [3, 1, 1, 'x'] } },
    });
    expect(groupsOf(n.zones.right).map((g) => g.tabs)).toEqual([['a'], ['b']]);
    expect(groupsOf(n.zones.right)[1].active).toBe('b');
    expect(groupCount(n.zones.right)).toBeLessThanOrEqual(MAX_GROUPS);
    expect(sum(sharesOf(n.zones.right))).toBeCloseTo(1);
  });

  it('promote the next group when the first is empty', () => {
    const n = normaliseLayout({ zones: { left: { tabs: [], more: [{ tabs: ['layers'], active: 'layers' }] } } });
    expect(n.zones.left.tabs).toEqual(['layers']);
    expect(n.zones.left.more).toBeUndefined();
  });

  it('ignore shares that do not fit the groups', () => {
    const n = normaliseLayout({ zones: { right: { tabs: ['a'], more: [{ tabs: ['b'] }], shares: [1] } } });
    expect(sharesOf(n.zones.right)).toEqual([0.5, 0.5]);
  });
});

describe('splitting by dropping on an edge', () => {
  it('a tab dropped on the bottom edge makes a group under, taking half the room', () => {
    const l = movePanelTo(sample(), 'help', { zone: 'right', group: 0, split: 'after' });
    expect(rightTabs(l)).toEqual([['layers', 'library'], ['help']]);
    expect(l.zones.right.active).toBe('layers');
    expect(sharesOf(l.zones.right)).toEqual([0.5, 0.5]);
    expect(locate(l, 'help')).toEqual({ zone: 'right', group: 1 });
    expect(locate(l, 'layers')).toEqual({ zone: 'right' });
  });

  it('the top edge puts the new group above, and it becomes the first group', () => {
    const l = movePanelTo(sample(), 'help', { zone: 'right', group: 0, split: 'before' });
    expect(rightTabs(l)).toEqual([['help'], ['layers', 'library']]);
    expect(l.zones.right.tabs).toEqual(['help']);
  });

  it('a panel from another zone can make a group, and a closed one opens into it', () => {
    const l = movePanelTo(sample(), 'timeline', { zone: 'right', group: 0, split: 'after' });
    expect(rightTabs(l)).toEqual([['layers', 'library', 'help'], ['timeline']]);
    expect(zoneTabs(l.zones.bottom)).toEqual([]);
    const c = movePanelTo(sample(), 'colours', { zone: 'right', group: 0, split: 'after' });
    expect(rightTabs(c)).toEqual([['layers', 'library', 'help'], ['colours']]);
    expect(c.hidden).not.toContain('colours');
  });

  it('splits again, up to the most groups', () => {
    let l = sample();
    l = movePanelTo(l, 'help', { zone: 'right', group: 0, split: 'after' });
    l = movePanelTo(l, 'library', { zone: 'right', group: 1, split: 'after' });
    expect(rightTabs(l)).toEqual([['layers'], ['help'], ['library']]);
    expect(sum(sharesOf(l.zones.right))).toBeCloseTo(1);
    l = movePanelTo(l, 'timeline', { zone: 'right', group: 2, split: 'after' });
    expect(groupCount(l.zones.right)).toBe(4);
    // A fifth does not fit: it joins the group instead.
    const full = movePanelTo(l, 'colours', { zone: 'right', group: 0, split: 'after' });
    expect(groupCount(full.zones.right)).toBe(4);
    expect(full.zones.right.tabs).toContain('colours');
  });

  it('splitting a group off its own lone tab changes nothing', () => {
    const l = movePanelTo(sample(), 'help', { zone: 'right', group: 0, split: 'after' });
    expect(movePanelTo(l, 'help', { zone: 'right', group: 1, split: 'after' })).toBe(l);
    expect(movePanelTo(l, 'help', { zone: 'right', group: 1 })).toBe(l);
  });

  it('works along the bottom, where groups sit side by side', () => {
    const l = movePanelTo(sample(), 'layers', { zone: 'bottom', group: 0, split: 'before' });
    expect(groupsOf(l.zones.bottom).map((g) => g.tabs)).toEqual([['layers'], ['timeline']]);
  });

  it('a whole window can be docked as a group', () => {
    let l = movePanelTo(sample(), 'help', { newFloat: { x: 10, y: 10 } });
    const id = l.floats[0].id;
    l = moveGroupTo(l, id, { zone: 'right', group: 0, split: 'after' });
    expect(l.floats).toEqual([]);
    expect(rightTabs(l)).toEqual([['layers', 'library'], ['help']]);
  });
});

describe('moving between groups', () => {
  const stacked = () => movePanelTo(sample(), 'help', { zone: 'right', group: 0, split: 'after' });

  it('a tab dropped in another group joins it at the place asked, and becomes its front tab', () => {
    const l = movePanelTo(stacked(), 'layers', { zone: 'right', group: 1, index: 0 });
    expect(rightTabs(l)).toEqual([['library'], ['layers', 'help']]);
    expect(activeOfGroup(l, 'right', 1)).toBe('layers');
  });

  it('a group that loses its last tab disappears and the other takes the room', () => {
    const l = movePanelTo(stacked(), 'help', { zone: 'right', group: 0 });
    expect(groupCount(l.zones.right)).toBe(1);
    expect(l.zones.right.tabs).toEqual(['layers', 'library', 'help']);
    expect(l.zones.right.more).toBeUndefined();
    expect(l.zones.right.shares).toBeUndefined();
  });

  it('emptying the first group promotes the one under it', () => {
    let l = stacked();
    for (const id of ['layers', 'library']) l = movePanelTo(l, id, { zone: 'right', group: 1 });
    expect(l.zones.right.tabs).toEqual(['help', 'layers', 'library']);
    expect(groupCount(l.zones.right)).toBe(1);
  });

  it('reordering inside the same group keeps the index right', () => {
    const l = movePanelTo(sample(), 'layers', { zone: 'right', index: 3 });
    expect(l.zones.right.tabs).toEqual(['library', 'help', 'layers']);
  });

  it('a drop without a group goes to the first group, even from a lower one', () => {
    const l = movePanelTo(stacked(), 'help', { zone: 'right' });
    expect(l.zones.right.tabs.at(-1)).toBe('help');
  });

  it('closing the last panel of a group removes the group', () => {
    const l = closePanel(stacked(), 'help');
    expect(groupCount(l.zones.right)).toBe(1);
    expect(l.hidden).toContain('help');
  });

  it('the front tab of a lower group comes forward with frontPanel and opens a folded zone', () => {
    let l = movePanelTo(stacked(), 'library', { zone: 'right', group: 1 });
    l = { ...l, zones: { ...l.zones, right: { ...l.zones.right, collapsed: true } } };
    l = frontPanel(l, 'help');
    expect(activeOfGroup(l, 'right', 1)).toBe('help');
    expect(l.zones.right.collapsed).toBe(false);
    expect(activeOfGroup(l, 'right', 0)).toBe('layers');
  });

  it('every panel is in exactly one place', () => {
    let l = stacked();
    l = movePanelTo(l, 'library', { zone: 'right', group: 1, split: 'after' });
    l = movePanelTo(l, 'timeline', { zone: 'right', group: 0 });
    const all = placedIds(l);
    expect(new Set(all).size).toBe(all.length);
    expect(all.sort()).toEqual(['help', 'layers', 'library', 'timeline']);
  });
});

describe('the lines between groups', () => {
  const three = (): Layout => {
    let l = movePanelTo(sample(), 'help', { zone: 'right', group: 0, split: 'after' });
    l = movePanelTo(l, 'library', { zone: 'right', group: 1, split: 'after' });
    return l;
  };

  it('moves one line, giving to one group what the next gives up', () => {
    const l = splitGroupsAt(three(), 'right', 0, 0.5);
    const s = sharesOf(l.zones.right);
    expect(s[0]).toBeCloseTo(0.5);
    expect(sum(s)).toBeCloseTo(1);
    expect(s[2]).toBeCloseTo(0.25);
  });

  it('never squeezes a group below the least', () => {
    const l = splitGroupsAt(three(), 'right', 0, 0);
    expect(sharesOf(l.zones.right)[0]).toBeCloseTo(MIN_SHARE);
    const m = splitGroupsAt(three(), 'right', 0, 1);
    expect(sharesOf(m.zones.right)[1]).toBeCloseTo(MIN_SHARE);
    expect(sum(sharesOf(m.zones.right))).toBeCloseTo(1);
  });

  it('nudges by steps and goes back to even', () => {
    const l = nudgeSplit(movePanelTo(sample(), 'help', { zone: 'right', group: 0, split: 'after' }), 'right', 0, 0.1);
    expect(sharesOf(l.zones.right)[0]).toBeCloseTo(0.6);
    expect(sharesOf(evenSplit(l, 'right', 0).zones.right)).toEqual([0.5, 0.5]);
  });

  it('a line that is not there changes nothing', () => {
    const l = sample();
    expect(splitGroupsAt(l, 'right', 0, 0.3)).toBe(l);
    expect(nudgeSplit(l, 'right', 2, 0.1)).toBe(l);
  });

  it('joining a group puts its tabs on the end of the one above and adds the room', () => {
    const l = joinGroupUp(three(), 'right', 1);
    expect(rightTabs(l)).toEqual([['layers', 'help'], ['library']]);
    expect(sum(sharesOf(l.zones.right))).toBeCloseTo(1);
    expect(joinGroupUp(three(), 'right', 0)).toEqual(three());
  });

  it('joining all makes one group again, in order', () => {
    const l = joinAllGroups(three(), 'right');
    expect(l.zones.right.tabs).toEqual(['layers', 'help', 'library']);
    expect(groupCount(l.zones.right)).toBe(1);
  });
});

describe('setGroups and retainTabs', () => {
  it('drops empty groups and keeps the proportions of the rest', () => {
    const l = emptyLayout();
    const z = l.zones.left;
    setGroups(z, [{ tabs: ['a'], active: 'a' }, { tabs: [], active: null }, { tabs: ['b'], active: null }], [0.5, 0.25, 0.25]);
    expect(groupsOf(z).map((g) => g.tabs)).toEqual([['a'], ['b']]);
    expect(sharesOf(z)[0]).toBeCloseTo(2 / 3);
    expect(activeOfGroup(l, 'left', 1)).toBe('b');
  });

  it('retainTabs removes gone panels from every group and any group left empty', () => {
    const l = movePanelTo(sample(), 'help', { zone: 'right', group: 0, split: 'after' });
    retainTabs(l.zones.right, (id) => id !== 'help' && id !== 'layers');
    expect(l.zones.right.tabs).toEqual(['library']);
    expect(l.zones.right.more).toBeUndefined();
  });
});

describe('workspaces carry stacks', () => {
  it('a workspace file keeps them, and a file without them reads as one group', () => {
    const layout = movePanelTo(sample(), 'help', { zone: 'right', group: 0, split: 'after' });
    const ws = sanitizeWorkspace({ id: 'u-1', name: 'Stacked', layout })!;
    const text = workspaceToText(ws);
    const back = parseWorkspaceText(text);
    expect(back.ok).toBe(true);
    if (back.ok) {
      expect(rightTabs(back.workspace.layout)).toEqual([['layers', 'library'], ['help']]);
      expect(back.workspace.layout.zones.right.shares).toEqual([0.5, 0.5]);
    }
    const plain = parseWorkspaceText(JSON.stringify({ format: 'frameling-workspace', version: 1, name: 'Old', layout: { zones: { right: { tabs: ['layers', 'help'] } } } }));
    expect(plain.ok && groupCount(plain.workspace.layout.zones.right)).toBe(1);
  });
});

describe('keyboard window resize steps', () => {
  const b = { x: 100, y: 100, w: 380, h: 320 };
  it('grows and shrinks from the top left', () => {
    expect(resizeBox(b, 16, 0)).toEqual({ w: 396, h: 320 });
    expect(resizeBox(b, 0, -64)).toEqual({ w: 380, h: 256 });
  });
  it('never goes under the least size', () => {
    expect(resizeBox(b, -1000, -1000)).toEqual({ w: 220, h: 140 });
  });
  it('stays on the screen', () => {
    expect(resizeBox(b, 5000, 5000, { w: 1000, h: 700 })).toEqual({ w: 900, h: 600 });
  });
  it('a window mostly off screen still gets the least size', () => {
    expect(resizeBox({ x: 990, y: 0, w: 300, h: 300 }, 16, 0, { w: 1000, h: 700 }).w).toBe(220);
  });
});

describe('stackPanels (one panel over another)', () => {
  it('puts the top panel in its own group above the bottom one, from anywhere', () => {
    const l = sample();
    l.zones.right.tabs = ['preview', 'layers', 'artboards'];
    l.zones.right.active = 'preview';
    const n = stackPanels(l, 'artboards', 'preview', 'right', 0.4);
    expect(rightTabs(n)).toEqual([['artboards'], ['preview', 'layers']]);
    expect(activeOfGroup(n, 'right', 1)).toBe('preview');
    expect(sharesOf(n.zones.right)[0]).toBeCloseTo(0.4);
    expect(sum(sharesOf(n.zones.right))).toBeCloseTo(1);
  });
  it('opens panels that were closed or in another zone, and a folded zone', () => {
    const l = sample();
    l.zones.left = { tabs: ['preview'], active: 'preview', size: 200, collapsed: false };
    l.zones.right.collapsed = true;
    l.hidden = ['artboards'];
    l.known.push('preview', 'artboards');
    const n = stackPanels(l, 'artboards', 'preview', 'right');
    expect(locate(n, 'preview')).toMatchObject({ zone: 'right' });
    expect(locate(n, 'artboards')).toMatchObject({ zone: 'right' });
    expect(n.zones.right.collapsed).toBe(false);
    expect(groupCount(n.zones.right)).toBe(2);
    expect(groupsOf(n.zones.right)[0].tabs).toEqual(['artboards']);
  });
  it('doing it twice changes nothing', () => {
    const l = sample();
    l.zones.right.tabs = ['preview', 'artboards', 'layers'];
    const once = stackPanels(l, 'artboards', 'preview', 'right');
    const twice = stackPanels(once, 'artboards', 'preview', 'right');
    expect(rightTabs(twice)).toEqual(rightTabs(once));
    expect(sharesOf(twice.zones.right)).toEqual(sharesOf(once.zones.right));
  });
});
