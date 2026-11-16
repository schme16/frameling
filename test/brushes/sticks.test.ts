// @vitest-environment jsdom
// The stick picker lists the nine sticks, and every picture in it is drawn by the real paper-catching line: the same
// Paper tooth effect the tool puts on the page, with that stick's own values. So a picture cannot drift from the stick.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drawShapeFx } from '../../src/core/render';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import { MEDIA } from '../../src/dry/maths';
import { defaultTip } from '../../src/geometry/tip';
import { clearThumbs, PREVIEW_SEED, thumbFor } from '../../src/brushes/thumbs';
import { activeStick, parseStickId, stickGroupOf, stickHint, stickIdOf, stickOf, stickRows, STICK_GROUPS } from '../../src/brushes/stickList';
import { fixedActiveId, fixedRows } from '../../src/brushes/tipList';
import { toothEffects } from '../../src/tools/vectorStroke';
import { groupsOf } from '../../src/brushes/library';

vi.mock('../../src/core/render', () => ({ drawShape: vi.fn(), drawShapeFx: vi.fn() }));

const chalk = { ...DEFAULT_BRUSH, tip: defaultTip('chalk') };
const charcoal = { ...DEFAULT_BRUSH, tip: defaultTip('charcoal') };

beforeEach(() => {
  clearThumbs();
  vi.mocked(drawShapeFx).mockClear();
  HTMLCanvasElement.prototype.getContext = (() => ({ setTransform() {} })) as unknown as HTMLCanvasElement['getContext'];
});

describe('the list of sticks', () => {
  it('has all nine, in the order the Medium list has them within each group, three groups', () => {
    const rows = stickRows(chalk);
    expect(rows.map((r) => r.name).sort()).toEqual(MEDIA.map((m) => m.label).sort());
    expect(rows).toHaveLength(9);
    expect(groupsOf(rows).map((g) => g.name)).toEqual([...STICK_GROUPS]);
    expect(groupsOf(rows).map((g) => g.brushes.length)).toEqual([2, 4, 3]);
  });

  it('gives every row its own id that reads back to the same stick', () => {
    for (const m of MEDIA) {
      expect(parseStickId(stickIdOf(m.id))).toBe(m.id);
      expect(stickHint(stickIdOf(m.id))).toBe(m.hint);
      expect(STICK_GROUPS).toContain(stickGroupOf(m.id));
    }
    expect(parseStickId('tip:chalk')).toBeNull();
    expect(parseStickId('stick:wax')).toBeNull();
  });

  it('draws each row with the brush in use, the stick swapped in, and nothing else changed', () => {
    const live = { ...chalk, size: 31, tip: { ...chalk.tip!, grain: 1.6 } };
    for (const r of stickRows(live)) {
      expect(r.brush.size).toBe(31);
      expect(r.brush.tip!.grain).toBe(1.6);
      expect(r.brush.tip!.kind).toBe('chalk');
      expect(r.id).toBe(stickIdOf(r.brush.tip!.dry!));
    }
  });

  it('says which stick is in use, and the usual one when Catch on paper is off', () => {
    expect(fixedActiveId('stick', { ...chalk, tip: { ...chalk.tip!, dry: 'crayon' } })).toBe('stick:crayon');
    expect(activeStick({ ...chalk.tip!, dry: undefined })).toBe('chalk');
    expect(activeStick({ ...charcoal.tip!, dry: undefined })).toBe('compressed-charcoal');
    expect(stickOf({ ...chalk.tip!, dry: undefined })).toBeNull();
    expect(stickOf(defaultTip('stamp'))).toBeNull();
  });

  it('is the same list from the picker whether the tip is chalk or charcoal', () => {
    expect(fixedRows('stick', chalk).map((r) => r.id)).toEqual(fixedRows('stick', charcoal).map((r) => r.id));
  });
});

describe('the pictures are the real stick', () => {
  for (const kind of ['dab', 'stroke'] as const) {
    it(`draws the ${kind} of every stick with the Paper tooth the tool builds for it`, () => {
      for (const r of stickRows(chalk)) {
        vi.mocked(drawShapeFx).mockClear();
        thumbFor(r.brush, kind, 120, 40, 1, '#222');
        expect(drawShapeFx, r.id).toHaveBeenCalledTimes(1);
        const shape = vi.mocked(drawShapeFx).mock.calls[0][1] as { effects?: { kind: string; values: Record<string, unknown> }[] };
        const real = toothEffects(r.brush, PREVIEW_SEED)!;
        expect(shape.effects?.[0].kind, r.id).toBe('tooth');
        expect(shape.effects?.[0].values, r.id).toEqual(real[0].values);
      }
    });
  }

  it('draws nine different lines: no stick is another one standing in', () => {
    const seen = new Set<string>();
    for (const r of stickRows(chalk)) {
      vi.mocked(drawShapeFx).mockClear();
      thumbFor(r.brush, 'stroke', 120, 40, 1, '#222');
      const shape = vi.mocked(drawShapeFx).mock.calls[0][1] as { effects: { values: unknown }[] };
      seen.add(JSON.stringify(shape.effects[0].values));
    }
    expect(seen.size).toBe(9);
  });

  it('draws a pencil as a pencil even on a charcoal tip', () => {
    const row = stickRows(charcoal).find((r) => r.id === 'stick:sketch-pencil')!;
    vi.mocked(drawShapeFx).mockClear();
    thumbFor(row.brush, 'stroke', 120, 40, 1, '#222');
    const shape = vi.mocked(drawShapeFx).mock.calls[0][1] as { effects: { values: Record<string, unknown> }[] };
    expect(shape.effects[0].values).toEqual(toothEffects({ ...charcoal, tip: { ...charcoal.tip!, dry: 'sketch-pencil' } }, PREVIEW_SEED)![0].values);
  });

  it('keeps the stick picker off the bare line painter', () => {
    for (const f of ['src/brushes/stickList.ts', 'src/brushes/BrushPicker.tsx', 'src/brushes/TipOptions.tsx']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/drawShape\(\s*g\s*,\s*buildStroke/);
    }
  });
});
