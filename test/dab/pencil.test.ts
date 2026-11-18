// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DAB, cleanDab, type DabBrush } from '../../src/dab/maths';
import { dabFromPencil, footprintOf, isDefaultFootprint, isPencilDab, movePencil, OLD_BRUSH_DEFAULT, type Footprint } from '../../src/dab/pencil';
import { getDab, resetDab } from '../../src/dab/settings';
import { DEFAULT_TOOL_SETTINGS, setToolSettings } from '../../src/tools/settings';
import { MY_PENCIL, movePencilOnce, myBrushes } from '../../src/brushes/presets';

const TWO = { w: 2, h: 2, colours: ['#ff0000', '#0000ff'], cells: [1, 2, 2, 1], keep: true };
const plain = (over: Partial<DabBrush> = {}): DabBrush => cleanDab({ ...DEFAULT_DAB, size: 3, ...over });

describe('which brushes the pencil can draw', () => {
  it('takes a plain hard square or round brush at a whole size', () => {
    expect(isPencilDab(plain())).toBe(true);
    expect(isPencilDab(plain({ tip: 'square', size: 1 }))).toBe(true);
    expect(isPencilDab(plain({ spacing: 1 }))).toBe(true);
  });
  it('takes a picture at its own size, side by side', () => {
    expect(isPencilDab(dabFromPencil({ size: 1, shape: 'square', stamp: TWO }))).toBe(true);
    expect(isPencilDab(cleanDab({ ...dabFromPencil({ size: 1, shape: 'square', stamp: TWO }), size: 6 }))).toBe(false);
    expect(isPencilDab(cleanDab({ ...dabFromPencil({ size: 1, shape: 'square', stamp: TWO }), spacing: 0.5 }))).toBe(false);
  });
  it.each([
    ['a soft edge', { hardness: 0.5 }],
    ['smooth edges', { aliased: false }],
    ['dots with gaps', { spacing: 1.5 }],
    ['scatter', { scatter: 0.3 }],
    ['size jitter', { sizeJitter: 0.2 }],
    ['angle jitter', { angleJitter: 0.2 }],
    ['an angle', { angle: 45 }],
    ['a flat tip', { roundness: 0.5 }],
    ['turning with the line', { follow: true }],
    ['low flow', { flow: 0.5 }],
    ['low opacity', { opacity: 0.5 }],
    ['wet paint', { wet: 0.5 }],
    ['a blend mode', { blend: 'multiply' as const }],
    ['a taper', { taper: { start: 4, end: 4, size: 1, opacity: 0 } }],
    ['pen dynamics', { dynamics: [{ from: 'pressure', to: 'size', amount: 1, invert: false }] as never }],
  ])('leaves %s to the dab engine', (_n, over) => {
    expect(isPencilDab(plain(over as Partial<DabBrush>))).toBe(false);
  });
});

describe('the pencil and the shared brush', () => {
  it('turns a size, shape and picture into a brush and back', () => {
    for (const fp of [{ size: 1, shape: 'square', stamp: null }, { size: 7, shape: 'round', stamp: null }, { size: 1, shape: 'square', stamp: TWO }] as Footprint[]) {
      const b = dabFromPencil(fp);
      expect(isPencilDab(b)).toBe(true);
      const back = footprintOf(b);
      if (!fp.stamp) expect(back.shape).toBe(fp.shape);
      expect(back.size).toBe(fp.stamp ? 2 : fp.size);
      expect(!!back.stamp).toBe(!!fp.stamp);
    }
  });
  it('knows the old default', () => {
    expect(isDefaultFootprint(OLD_BRUSH_DEFAULT)).toBe(true);
    expect(isDefaultFootprint({ ...OLD_BRUSH_DEFAULT, size: 2 })).toBe(false);
    expect(isDefaultFootprint({ ...OLD_BRUSH_DEFAULT, shape: 'round' })).toBe(false);
    expect(isDefaultFootprint({ ...OLD_BRUSH_DEFAULT, stamp: TWO })).toBe(false);
    // A picture that is not a picture is the default.
    expect(isDefaultFootprint({ ...OLD_BRUSH_DEFAULT, stamp: { w: 99 } as never })).toBe(true);
  });
});

describe('the one time move of the Brush\'s own settings', () => {
  const was = (over: Partial<Footprint>): Footprint => ({ ...OLD_BRUSH_DEFAULT, ...over });
  it('gives someone who never changed them, and never used the Pixel brush, the pencil they always had', () => {
    const r = movePencil({ done: false, old: OLD_BRUSH_DEFAULT, hadBrush: false });
    expect(r.use).toEqual(dabFromPencil(OLD_BRUSH_DEFAULT));
    expect(r.keep).toBeNull();
    expect(r.done).toBe(true);
  });
  it('leaves a Pixel brush of their own alone when the old settings were never changed', () => {
    expect(movePencil({ done: false, old: OLD_BRUSH_DEFAULT, hadBrush: true })).toEqual({ done: true, use: null, keep: null });
  });
  it('makes changed settings the current brush and saves them too', () => {
    const r = movePencil({ done: false, old: was({ size: 5, shape: 'round' }), hadBrush: false });
    expect(footprintOf(r.use!)).toMatchObject({ size: 5, shape: 'round' });
    expect(r.keep).toEqual(r.use);
  });
  it('keeps a Pixel brush of their own as the current one, and saves the old settings beside it', () => {
    const r = movePencil({ done: false, old: was({ size: 5 }), hadBrush: true });
    expect(r.use).toBeNull();
    expect(footprintOf(r.keep!).size).toBe(5);
  });
  it('keeps a picture brush with its colours and its size', () => {
    const r = movePencil({ done: false, old: was({ stamp: TWO }), hadBrush: false });
    expect(r.use!.tip).toBe('picture');
    expect(r.use!.picture).toMatchObject({ w: 2, h: 2, keep: true });
    expect(r.use!.size).toBe(2);
    expect(isPencilDab(r.use!)).toBe(true);
  });
  it('does nothing the second time', () => {
    const first = movePencil({ done: false, old: was({ size: 5 }), hadBrush: false });
    expect(movePencil({ done: first.done, old: was({ size: 5 }), hadBrush: false })).toEqual({ done: true, use: null, keep: null });
  });
});

describe('the move at launch', () => {
  beforeEach(() => {
    resetDab();
  });
  it('puts the old size and shape in the pixel brush and the saved brushes, once', () => {
    setToolSettings({ ...DEFAULT_TOOL_SETTINGS, pixelBrushSize: 5, pixelBrushShape: 'round' });
    const r = movePencilOnce();
    expect(r?.keep).toBeTruthy();
    expect(getDab()).toMatchObject({ tip: 'round', size: 5 });
    const mine = myBrushes().filter((p) => p.name === MY_PENCIL);
    expect(mine).toHaveLength(1);
    expect(mine[0].group).toBe('Pixel basics');
    // The old settings are still there for Pencil and Shade.
    expect(DEFAULT_TOOL_SETTINGS.pixelBrushSize).toBe(1);
    // Again: nothing changes, not the brush in hand and not the saved list.
    resetDab();
    const before = myBrushes();
    expect(movePencilOnce()).toBeNull();
    expect(getDab()).toEqual(cleanDab(DEFAULT_DAB));
    expect(myBrushes()).toBe(before);
  });
});
