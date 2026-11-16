// The pen tips as picker rows: every tip is one row, a stamp is its shape, ids round trip, and a row is the brush in use
// with that tip so its sample has your size.
import { describe, expect, it } from 'vitest';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import { defaultTip, STAMPS, TIPS } from '../../src/geometry/tip';
import { buildSections, groupsOf, searchBrushes } from '../../src/brushes/library';
import { parseTipId, PLAIN_ID, tipHint, tipIdOf, tipRows, TIP_GROUPS } from '../../src/brushes/tipList';

const rows = (custom?: number[][]) => tipRows(DEFAULT_BRUSH, custom);

describe('tipRows', () => {
  it('lists Plain, every kind but Stamp, and every stamp shape once', () => {
    const ids = rows().map((r) => r.id);
    expect(ids).toHaveLength(1 + (TIPS.length - 1) + STAMPS.length);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain(PLAIN_ID);
    expect(ids).not.toContain('tip:stamp');
    for (const s of STAMPS) expect(ids).toContain(`tip:stamp:${s.id}`);
  });

  it('sits the tips in four groups, in a set order, the shapes together', () => {
    const groups = groupsOf(rows()).map((g) => g.name);
    expect(groups).toEqual([...TIP_GROUPS]);
    const stamps = groupsOf(rows()).find((g) => g.name === 'Stamps')!;
    expect(stamps.brushes.map((b) => b.name)).toEqual(STAMPS.map((s) => s.label));
  });

  it('draws each row with the brush in use, so size and pressure carry over, and the tip is its own', () => {
    const live = { ...DEFAULT_BRUSH, size: 31, thinning: 0.4, tip: defaultTip('chalk') };
    for (const r of tipRows(live)) {
      expect(r.brush.size).toBe(31);
      expect(r.brush.thinning).toBe(0.4);
    }
    expect(tipRows(live).find((r) => r.id === PLAIN_ID)!.brush.tip).toBeUndefined();
    expect(tipRows(live).find((r) => r.id === 'tip:chalk')!.brush.tip?.kind).toBe('chalk');
    expect(tipRows(live).find((r) => r.id === 'tip:stamp:heart')!.brush.tip).toMatchObject({ kind: 'stamp', shape: 'heart' });
  });

  it('shows a stamp of your own as "Yours" only when the brush has one', () => {
    expect(rows().some((r) => r.id === 'tip:stamp:custom')).toBe(false);
    const mine = [[0, 0, 1, 0, 1, 1]];
    const r = rows(mine).find((x) => x.id === 'tip:stamp:custom')!;
    expect(r.name).toBe('Yours');
    expect(r.brush.tip?.custom).toEqual(mine);
  });

  it('is found by search the way brushes are, by tip name or by group', () => {
    expect(searchBrushes(rows(), 'leaf').map((r) => r.id)).toEqual(['tip:stamp:leaf']);
    expect(searchBrushes(rows(), 'stamps')).toHaveLength(STAMPS.length);
    expect(searchBrushes(rows(), 'dry').map((r) => r.name)).toEqual(['Chalk', 'Charcoal', 'Watercolour']);
  });

  it('has only group sections, no favourites or recent worth showing, when built the way the panel builds it', () => {
    const open = groupsOf(rows()).map((g) => `group:${g.name.toLowerCase()}`);
    const built = buildSections({ all: rows(), favourites: [], recent: [], activeId: PLAIN_ID, opened: open, query: '' });
    expect(built.filter((s) => s.kind === 'group').every((s) => s.open && s.count > 0)).toBe(true);
    expect(built.filter((s) => s.kind === 'favourites' || s.kind === 'recent').every((s) => s.count === 0)).toBe(true);
  });
});

describe('tip ids', () => {
  it('name the tip in use, a stamp by its shape', () => {
    expect(tipIdOf(undefined)).toBe(PLAIN_ID);
    expect(tipIdOf(defaultTip('nib'))).toBe('tip:nib');
    expect(tipIdOf(defaultTip('stamp'))).toBe('tip:stamp:leaf');
    expect(tipIdOf({ kind: 'stamp', shape: 'paw' })).toBe('tip:stamp:paw');
    expect(tipIdOf({ kind: 'stamp' })).toBe('tip:stamp:leaf');
  });

  it('read back to the same kind and shape, and refuse anything that is not a tip', () => {
    expect(parseTipId(PLAIN_ID)).toEqual({ kind: null });
    expect(parseTipId('tip:bristle')).toEqual({ kind: 'bristle' });
    expect(parseTipId('tip:stamp:star')).toEqual({ kind: 'stamp', shape: 'star' });
    expect(parseTipId('tip:stamp:custom')).toEqual({ kind: 'stamp', shape: 'custom' });
    for (const bad of ['tip:stamp', 'tip:stamp:nope', 'tip:nope', 'tip:chalk:leaf', 'starter:ink', '', 'tip:']) expect(parseTipId(bad)).toBeNull();
    for (const r of rows([[0, 0, 1, 1, 0, 1]])) expect(parseTipId(r.id)).not.toBeNull();
  });

  it('give every row a plain line for its tooltip', () => {
    for (const r of rows([[0, 0, 1, 1, 0, 1]])) expect(tipHint(r.id).length).toBeGreaterThan(10);
    expect(tipHint('tip:stamp:paw')).toBe('Scatters a paw print along the line, a little off it and a little turned.');
  });
});
