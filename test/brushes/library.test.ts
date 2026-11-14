// The picker's rules: groups, search, favourites, recent, what is open, and the keyboard order.
import { describe, expect, it } from 'vitest';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import {
  buildSections,
  cleanGroup,
  flatten,
  foldableKeys,
  groupKey,
  groupNames,
  groupOf,
  groupsOf,
  moveHot,
  MY_GROUP,
  pushRecent,
  rowKey,
  sanitizeIds,
  sanitizeMemory,
  searchBrushes,
  startKey,
  STARTERS_GROUP,
  toggleId,
} from '../../src/brushes/library';
import { addShared, allPresets, brushesToText, MAX_PRESETS, movePreset, parseBrushesText, sanitizeList, savePreset, STARTERS, type BrushPreset } from '../../src/brushes/model';

const mk = (id: string, name: string, group?: string): BrushPreset => ({ id, name, tool: 'brush', brush: { ...DEFAULT_BRUSH }, ...(group ? { group } : {}) });
const big = (n: number): BrushPreset[] => allPresets(Array.from({ length: n }, (_, i) => mk(`m${i}`, `Brush ${i}`, i % 2 ? 'Inking' : i % 3 ? 'Painting' : undefined)));

describe('groups', () => {
  it('puts the starters in Starters and a brush with no group in My brushes', () => {
    expect(groupOf(STARTERS[0])).toBe(STARTERS_GROUP);
    expect(groupOf(mk('a', 'A'))).toBe(MY_GROUP);
    expect(groupOf(mk('a', 'A', 'Inking'))).toBe('Inking');
  });
  it('cleans a group name, and refuses the picker\'s own names', () => {
    expect(cleanGroup('  Ink   pens ')).toBe('Ink pens');
    expect(cleanGroup('')).toBeUndefined();
    expect(cleanGroup('my BRUSHES')).toBeUndefined();
    expect(cleanGroup('Recent')).toBeUndefined();
    expect(cleanGroup('favourites')).toBeUndefined();
    expect(cleanGroup(5)).toBeUndefined();
    expect(cleanGroup('x'.repeat(100))).toHaveLength(40);
  });
  it('orders the groups: My brushes, Starters, then yours by name', () => {
    const names = groupsOf(big(10)).map((g) => g.name);
    expect(names).toEqual([MY_GROUP, STARTERS_GROUP, 'Inking', 'Painting']);
  });
  it('lists the group names of your own once each, for suggesting one', () => {
    expect(groupNames([mk('a', 'A', 'Inking'), mk('b', 'B', 'inking'), mk('c', 'C', 'Aqua'), mk('d', 'D')])).toEqual(['Aqua', 'Inking']);
  });
});

describe('old saved brushes', () => {
  it('read back with no group, and land in My brushes', () => {
    const list = sanitizeList([{ id: 'x1', name: 'Fur', tool: 'brush', brush: { size: 9 } }]);
    expect(list[0].group).toBeUndefined();
    expect(groupOf(list[0])).toBe(MY_GROUP);
  });
  it('keep a group that was saved, and drop a damaged one', () => {
    const list = sanitizeList([
      { name: 'A', brush: {}, group: 'Inking' },
      { name: 'B', brush: {}, group: 42 },
      { name: 'C', brush: {}, group: 'Starters' },
    ]);
    expect(list.map((p) => p.group)).toEqual(['Inking', undefined, undefined]);
  });
  it('saves into a group, moves between groups, and back to My brushes with an empty one', () => {
    const r = savePreset([], 'Fur', DEFAULT_BRUSH, 'f1', 'Hair')!;
    expect(r.preset.group).toBe('Hair');
    const moved = movePreset(r.list, 'f1', 'Fur and feathers');
    expect(moved[0].group).toBe('Fur and feathers');
    expect(movePreset(moved, 'f1', '')[0].group).toBeUndefined();
    expect(r.list[0].group).toBe('Hair');
  });
  it('replacing a brush by name keeps its group unless one is given', () => {
    const first = savePreset([], 'Fur', DEFAULT_BRUSH, 'f1', 'Hair')!;
    expect(savePreset(first.list, 'Fur', DEFAULT_BRUSH, 'f2')!.preset.group).toBe('Hair');
    expect(savePreset(first.list, 'Fur', DEFAULT_BRUSH, 'f2', '')!.preset.group).toBeUndefined();
  });
  it('travel in a shared file with their group, and a file without groups still reads', () => {
    const text = brushesToText([mk('a', 'A', 'Inking'), mk('b', 'B')]);
    const r = parseBrushesText(text);
    expect(r.ok && r.presets.map((p) => p.group)).toEqual(['Inking', undefined]);
    const old = parseBrushesText(JSON.stringify({ format: 'frameling-brushes', version: 1, presets: [{ name: 'Old', tool: 'brush', brush: {} }] }));
    expect(old.ok && old.presets[0].group).toBeUndefined();
    const added = addShared([], r.ok ? r.presets : [], (() => { let n = 0; return () => `n${n++}`; })());
    expect(added.list.map((p) => p.group)).toEqual(['Inking', undefined]);
  });
});

describe('the limit', () => {
  it('holds a brush pack of hundreds', () => {
    expect(MAX_PRESETS).toBeGreaterThanOrEqual(400);
    expect(sanitizeList(Array.from({ length: 400 }, (_, i) => ({ name: `B${i}`, brush: {} })))).toHaveLength(400);
  });
});

describe('search', () => {
  const all = [mk('a', 'Fine liner', 'Inking'), mk('b', 'Brush pen', 'Inking'), mk('c', 'Pencil', 'Sketching'), mk('d', 'Inked wash', 'Painting')];
  it('needs every word, in the name or the group, capitals ignored', () => {
    expect(searchBrushes(all, 'PEN').map((p) => p.id)).toEqual(['b', 'c']);
    expect(searchBrushes(all, 'inking pen').map((p) => p.id)).toEqual(['b']);
    expect(searchBrushes(all, 'zzz')).toEqual([]);
  });
  it('lists name matches before group-only matches', () => {
    expect(searchBrushes(all, 'ink').map((p) => p.id)).toEqual(['d', 'a', 'b']);
  });
  it('gives everything for an empty search', () => {
    expect(searchBrushes(all, '  ')).toHaveLength(4);
  });
});

describe('favourites and recent', () => {
  it('toggles an id in and out', () => {
    expect(toggleId(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleId(['a', 'b'], 'a')).toEqual(['b']);
  });
  it('puts the latest first, once, and keeps eight', () => {
    expect(pushRecent(['a', 'b'], 'b')).toEqual(['b', 'a']);
    const many = Array.from({ length: 8 }, (_, i) => `i${i}`);
    expect(pushRecent(many, 'new')).toHaveLength(8);
    expect(pushRecent(many, 'new')[0]).toBe('new');
  });
  it('reads saved ids safely', () => {
    expect(sanitizeIds(['a', 'a', 3, '', null, 'b'])).toEqual(['a', 'b']);
    expect(sanitizeIds('nope')).toEqual([]);
  });
  it('reads what the picker remembered, with defaults for anything off', () => {
    expect(sanitizeMemory(null)).toEqual({ favourites: [], recent: [], rowScale: 1, box: null });
    const m = sanitizeMemory({ favourites: ['a'], recent: ['b'], rowScale: 9, box: { w: 5000, h: 100 } });
    expect(m.rowScale).toBe(1.5);
    expect(m.box).toEqual({ w: 640, h: 260 });
    expect(sanitizeMemory({ box: { w: 400 } }).box).toBeNull();
  });
});

describe('what the list shows', () => {
  const all = big(30);
  const facts = (over = {}) => ({ all, favourites: ['starter:ink', 'gone'], recent: ['m4', 'starter:pencil'], activeId: 'm1', opened: null, query: '', ...over });
  it('opens only the group the brush in use is in, so the rest cost nothing', () => {
    const sections = buildSections(facts());
    const open = sections.filter((s) => s.open);
    expect(open.map((s) => s.key)).toEqual([groupKey('Inking')]);
    expect(sections.filter((s) => !s.open).every((s) => s.brushes.length === 0)).toBe(true);
    expect(sections.find((s) => s.key === groupKey('Inking'))!.here).toBe(true);
    expect(sections.filter((s) => s.kind !== 'group').some((s) => s.here)).toBe(false);
  });
  it('counts a folded group but holds none of its brushes', () => {
    const s = buildSections(facts({ opened: [] })).find((x) => x.key === groupKey('Inking'))!;
    expect(s.count).toBeGreaterThan(0);
    expect(s.brushes).toHaveLength(0);
  });
  it('leaves out favourites and recents whose brush is gone', () => {
    const sections = buildSections(facts({ opened: ['favourites', 'recent'] }));
    expect(sections[0].brushes.map((b) => b.id)).toEqual(['starter:ink']);
    expect(sections[1].brushes.map((b) => b.id)).toEqual(['m4', 'starter:pencil']);
  });
  it('shows at most five recent brushes', () => {
    const recent = Array.from({ length: 8 }, (_, i) => `m${i}`);
    expect(buildSections(facts({ recent, opened: ['recent'] }))[1].brushes).toHaveLength(5);
  });
  it('swaps everything for one flat list while searching', () => {
    const sections = buildSections(facts({ query: 'brush 1' }));
    expect(sections).toHaveLength(1);
    expect(sections[0].kind).toBe('found');
    expect(sections[0].brushes.length).toBe(sections[0].count);
    expect(flatten(sections).every((i) => i.kind === 'row')).toBe(true);
  });
  it('lists every foldable section for fold all and open all', () => {
    expect(foldableKeys({ all })).toEqual(['favourites', 'recent', groupKey(MY_GROUP), groupKey(STARTERS_GROUP), groupKey('Inking'), groupKey('Painting')]);
  });
  it('stays cheap with 400 brushes: rows only for the open group', () => {
    const lots = big(400);
    const sections = buildSections({ all: lots, favourites: [], recent: [], activeId: 'm1', opened: null, query: '' });
    const rows = flatten(sections).filter((i) => i.kind === 'row');
    expect(rows.length).toBeLessThan(lots.length / 2 + 5);
  });
});

describe('keyboard order', () => {
  const all = big(6);
  const items = flatten(buildSections({ all, favourites: [], recent: [], activeId: 'm1', opened: [groupKey('Inking')], query: '' }));
  it('lists headings and the rows of open groups, top to bottom', () => {
    expect(items[0]).toMatchObject({ kind: 'head', section: 'favourites' });
    const inking = items.filter((i) => i.section === groupKey('Inking'));
    expect(inking[0].kind).toBe('head');
    expect(inking.slice(1).every((i) => i.kind === 'row')).toBe(true);
  });
  it('starts on the brush in use, or else the first row', () => {
    expect(startKey(items, 'm1')).toBe(rowKey(groupKey('Inking'), 'm1'));
    expect(startKey(items, null)).toBe(items.find((i) => i.kind === 'row')!.key);
    expect(startKey([], null)).toBeNull();
  });
  it('moves with the arrows, wraps at the ends, and jumps with Page and Home and End', () => {
    const first = items[0].key;
    const last = items[items.length - 1].key;
    expect(moveHot(items, first, 'ArrowDown')).toBe(items[1].key);
    expect(moveHot(items, first, 'ArrowUp')).toBe(last);
    expect(moveHot(items, last, 'ArrowDown')).toBe(first);
    expect(moveHot(items, null, 'ArrowDown')).toBe(first);
    expect(moveHot(items, first, 'End')).toBe(last);
    expect(moveHot(items, last, 'Home')).toBe(first);
    expect(moveHot(items, first, 'PageDown')).toBe(items[Math.min(8, items.length - 1)].key);
    expect(moveHot([], null, 'ArrowDown')).toBeNull();
  });
  it('gives a favourite and the same brush in its group different keys', () => {
    const both = flatten(buildSections({ all, favourites: ['m1'], recent: [], activeId: null, opened: ['favourites', groupKey('Inking')], query: '' }));
    const keys = both.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('capitals', () => {
  it('make no new group', () => {
    const g = groupsOf(allPresets([mk('a', 'A', 'Inking'), mk('b', 'B', 'inking')]));
    expect(g.map((x) => x.name)).toEqual([STARTERS_GROUP, 'Inking']);
    expect(g[1].brushes).toHaveLength(2);
  });
});
