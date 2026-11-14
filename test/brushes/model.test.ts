import { describe, expect, it } from 'vitest';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import {
  addShared,
  allPresets,
  brushesToText,
  cleanName,
  deletePreset,
  matchPreset,
  MAX_NAME,
  MAX_PRESETS,
  parseBrushesText,
  presetState,
  renamePreset,
  sameBrush,
  sanitizeList,
  sanitizePreset,
  savePreset,
  STARTERS,
  stepPreset,
  uniqueName,
  updatePreset,
  type BrushPreset,
} from '../../src/brushes/model';

const wide = { ...DEFAULT_BRUSH, size: 40, taperEnd: 12 };
let n = 0;
const id = () => `t${++n}`;
const saved = (name: string, brush = wide, i = id()): BrushPreset => ({ id: i, name, tool: 'brush', brush });

describe('starters', () => {
  it('are Ink, Marker, Pencil and Tapered brush, flagged built in, with distinct ids and sane values', () => {
    expect(STARTERS.map((s) => s.name)).toEqual(['Ink', 'Marker', 'Pencil', 'Tapered brush']);
    expect(new Set(STARTERS.map((s) => s.id)).size).toBe(4);
    for (const s of STARTERS) {
      expect(s.builtin).toBe(true);
      expect(s.tool).toBe('brush');
      expect(s.brush.size).toBeGreaterThan(0);
    }
    expect(STARTERS[3].brush.taperStart).toBeGreaterThan(0);
    expect(STARTERS[1].brush.thinning).toBe(0);
  });
  it('do not match each other', () => {
    for (const a of STARTERS) for (const b of STARTERS) expect(sameBrush(a.brush, b.brush)).toBe(a === b);
  });
});

describe('names', () => {
  it('are tidied and cut to length', () => {
    expect(cleanName('  Soft   shading \n')).toBe('Soft shading');
    expect(cleanName('x'.repeat(100))).toHaveLength(MAX_NAME);
    expect(cleanName(42)).toBe('');
    expect(cleanName('   ')).toBe('');
  });
  it('are made unique without caring about capitals', () => {
    expect(uniqueName('Ink', ['Ink'])).toBe('Ink 2');
    expect(uniqueName('ink', ['Ink', 'Ink 2'])).toBe('ink 3');
    expect(uniqueName('Fresh', ['Ink'])).toBe('Fresh');
    expect(uniqueName('', [])).toBe('My brush');
    expect(uniqueName('x'.repeat(MAX_NAME), ['x'.repeat(MAX_NAME)])).toHaveLength(MAX_NAME);
  });
});

describe('sameBrush', () => {
  it('ignores rounding dust but not real changes', () => {
    expect(sameBrush(wide, { ...wide, size: 40 + 1e-9 })).toBe(true);
    expect(sameBrush(wide, { ...wide, size: 41 })).toBe(false);
    expect(sameBrush(wide, { ...wide, capStart: false })).toBe(false);
  });
});

describe('saving, updating, renaming and deleting', () => {
  it('adds a brush with a copy of the settings', () => {
    const b = { ...wide };
    const r = savePreset([], '  Shading ', b, 'a')!;
    expect(r.replaced).toBe(false);
    expect(r.preset).toMatchObject({ id: 'a', name: 'Shading', tool: 'brush' });
    b.size = 1;
    expect(r.list[0].brush.size).toBe(40);
  });
  it('refuses an empty name and a full list', () => {
    expect(savePreset([], '  ', wide, 'a')).toBeNull();
    const full = Array.from({ length: MAX_PRESETS }, (_, i) => saved(`B${i}`));
    expect(savePreset(full, 'One more', wide, 'z')).toBeNull();
    expect(savePreset(full, 'b3', wide, 'z')?.replaced).toBe(true);
  });
  it('replaces one of yours with the same name, keeping its id and place', () => {
    const list = [saved('A', wide, 'a'), saved('B', wide, 'b')];
    const r = savePreset(list, 'a', { ...wide, size: 5 }, 'new')!;
    expect(r.replaced).toBe(true);
    expect(r.list.map((p) => p.id)).toEqual(['a', 'b']);
    expect(r.list[0].brush.size).toBe(5);
    expect(r.list[0].name).toBe('A');
  });
  it('gives a name a starter has a number after it', () => {
    expect(savePreset([], 'Ink', wide, 'a')!.preset.name).toBe('Ink 2');
  });
  it('updates only the brush asked for', () => {
    const list = [saved('A', wide, 'a'), saved('B', wide, 'b')];
    const out = updatePreset(list, 'b', { ...wide, size: 3 });
    expect(out[0].brush.size).toBe(40);
    expect(out[1].brush.size).toBe(3);
    expect(list[1].brush.size).toBe(40);
  });
  it('never changes a starter', () => {
    const before = JSON.stringify(STARTERS);
    expect(updatePreset([], STARTERS[0].id, wide)).toEqual([]);
    expect(renamePreset([], STARTERS[0].id, 'Mine')).toEqual([]);
    expect(deletePreset([], STARTERS[0].id)).toEqual([]);
    expect(JSON.stringify(STARTERS)).toBe(before);
  });
  it('renames, avoiding clashes with other brushes and starters, and ignores an empty name', () => {
    const list = [saved('A', wide, 'a'), saved('B', wide, 'b')];
    expect(renamePreset(list, 'a', 'B')[0].name).toBe('B 2');
    expect(renamePreset(list, 'a', 'ink')[0].name).toBe('ink 2');
    expect(renamePreset(list, 'a', 'A')[0].name).toBe('A');
    expect(renamePreset(list, 'a', '  ')).toEqual(list);
  });
  it('deletes by id', () => {
    const list = [saved('A', wide, 'a'), saved('B', wide, 'b')];
    expect(deletePreset(list, 'a').map((p) => p.id)).toEqual(['b']);
    expect(deletePreset(list, 'nope')).toHaveLength(2);
  });
});

describe('which brush is lit', () => {
  const mine = [saved('Wide', wide, 'w')];
  it('lights the brush that matches, yours before a starter', () => {
    expect(presetState(wide, mine, null)).toEqual({ activeId: 'w', changed: false });
    expect(presetState(STARTERS[1].brush, mine, null)).toEqual({ activeId: STARTERS[1].id, changed: false });
    const copy = [saved('My ink', STARTERS[0].brush, 'c')];
    expect(matchPreset(STARTERS[0].brush, copy)?.id).toBe('c');
  });
  it('lights nothing when the brush matches nothing and nothing was picked', () => {
    expect(presetState({ ...wide, size: 77 }, mine, null)).toEqual({ activeId: null, changed: false });
  });
  it('keeps the picked brush lit but marks it changed after a slider moves', () => {
    expect(presetState({ ...wide, size: 77 }, mine, 'w')).toEqual({ activeId: 'w', changed: true });
    expect(presetState(wide, mine, 'w')).toEqual({ activeId: 'w', changed: false });
  });
  it('falls back to matching when the picked brush is gone', () => {
    expect(presetState(wide, mine, 'gone')).toEqual({ activeId: 'w', changed: false });
  });
});

describe('stepping through the row', () => {
  const all = allPresets([saved('Mine', wide, 'm')]);
  it('wraps both ways', () => {
    expect(stepPreset(all, all[all.length - 1].id, 1)?.id).toBe(all[0].id);
    expect(stepPreset(all, all[0].id, -1)?.id).toBe('m');
    expect(stepPreset(all, all[0].id, 1)?.id).toBe(all[1].id);
  });
  it('starts at the first or last from a brush that matches nothing', () => {
    expect(stepPreset(all, null, 1)?.id).toBe(all[0].id);
    expect(stepPreset(all, null, -1)?.id).toBe('m');
    expect(stepPreset([], null, 1)).toBeUndefined();
  });
});

describe('reading saved brushes (backward compatible and forgiving)', () => {
  it('fills a missing field from the standard brush and holds numbers to their range', () => {
    const p = sanitizePreset({ name: 'Old', brush: { size: 9, thinning: 5, bogus: 1 } }, 'x')!;
    expect(p.brush.size).toBe(9);
    expect(p.brush.thinning).toBe(1);
    expect(p.brush.smoothing).toBe(DEFAULT_BRUSH.smoothing);
    expect(p.brush.capEnd).toBe(DEFAULT_BRUSH.capEnd);
    expect(p.tool).toBe('brush');
  });
  it('turns away a nameless one, a non-brush tool and rubbish', () => {
    expect(sanitizePreset({ brush: {} }, 'x')).toBeNull();
    expect(sanitizePreset({ name: 'A', tool: 'pencil', brush: {} }, 'x')).toBeNull();
    expect(sanitizePreset({ name: 'A' }, 'x')).toBeNull();
    expect(sanitizePreset(null, 'x')).toBeNull();
    expect(sanitizePreset([], 'x')).toBeNull();
  });
  it('cleans a saved list: drops the damaged, makes ids and names unique, keeps order', () => {
    const list = sanitizeList([
      { id: 'a', name: 'One', brush: { size: 3 } },
      'junk',
      { id: 'a', name: 'One', brush: { size: 4 } },
      { id: 'starter:ink', name: 'Ink', brush: { size: 4 } },
      { name: '', brush: {} },
    ]);
    expect(list.map((p) => p.name)).toEqual(['One', 'One 2', 'Ink 2']);
    expect(new Set(list.map((p) => p.id)).size).toBe(3);
    expect(list.some((p) => p.id.startsWith('starter:'))).toBe(false);
  });
  it('reads anything that is not a list as no brushes, and stops at the limit', () => {
    expect(sanitizeList(undefined)).toEqual([]);
    expect(sanitizeList({})).toEqual([]);
    expect(sanitizeList(Array.from({ length: MAX_PRESETS + 20 }, (_, i) => ({ name: `B${i}`, brush: {} })))).toHaveLength(MAX_PRESETS);
  });
});

describe('sharing', () => {
  it('round-trips your brushes and leaves the starters out', () => {
    const text = brushesToText([...STARTERS, saved('Mine', wide, 'm')]);
    const r = parseBrushesText(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.presets).toEqual([{ name: 'Mine', brush: wide }]);
    expect(JSON.parse(text).format).toBe('frameling-brushes');
  });
  it('turns away what is not a set of brushes, with a sentence', () => {
    for (const bad of ['', 'not json', '{}', '[]', JSON.stringify({ format: 'frameling-workspace' }), JSON.stringify({ format: 'frameling-brushes', presets: 3 }), JSON.stringify({ format: 'frameling-brushes', presets: [] }), 7, null]) {
      const r = parseBrushesText(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toMatch(/\.$/);
    }
    const newer = parseBrushesText(JSON.stringify({ format: 'frameling-brushes', version: 99, presets: [] }));
    expect(newer.ok === false && newer.error).toMatch(/newer/);
    expect(parseBrushesText('x'.repeat(300 * 1024)).ok).toBe(false);
  });
  it('counts what it could not read and keeps the rest', () => {
    const r = parseBrushesText(JSON.stringify({ format: 'frameling-brushes', version: 1, presets: [{ name: 'Good', brush: { size: 2 } }, { name: '' }, 4] }));
    expect(r.ok && r.skipped).toBe(2);
    expect(r.ok && r.presets.map((p) => p.name)).toEqual(['Good']);
  });
  it('adds shared brushes under fresh ids and names that do not clash, up to the limit', () => {
    let k = 0;
    const out = addShared([saved('Ink 2', wide, 'o')], [{ name: 'Ink', brush: wide }, { name: 'Ink 2', brush: wide }], () => `n${++k}`);
    expect(out.added).toBe(2);
    expect(out.list.map((p) => p.name)).toEqual(['Ink 2', 'Ink 3', 'Ink 2 2']);
    expect(out.list.map((p) => p.id)).toEqual(['o', 'n1', 'n2']);
    const nearFull = Array.from({ length: MAX_PRESETS - 1 }, (_, i) => saved(`B${i}`));
    expect(addShared(nearFull, [{ name: 'a', brush: wide }, { name: 'b', brush: wide }], id).added).toBe(1);
  });
});
