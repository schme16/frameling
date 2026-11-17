// The pictures on the Tip, Stick and Paper pickers show only themselves.
import { describe, expect, it } from 'vitest';
import { MEDIA } from '../../src/dry/maths';
import { PAPERS } from '../../src/dry/paper';
import { catchOf } from '../../src/dry/PaperSwatch';
import { defaultTip, TIPS } from '../../src/geometry/tip';
import { STICK_PICTURE_PAPER, stickPictureBrush, tipPictureBrush } from '../../src/brushes/pictures';

describe('the tip picture', () => {
  it('is the same neutral brush for every tip, so only the tip differs', () => {
    const plain = tipPictureBrush(undefined);
    for (const t of TIPS) {
      const { tip, ...rest } = tipPictureBrush(defaultTip(t.id));
      const { tip: _t, ...base } = plain;
      expect(rest).toEqual(base);
      expect(tip?.kind).toBe(t.id);
    }
  });
  it('carries nothing of the paper: no tooth stick, no matte', () => {
    const b = tipPictureBrush({ ...defaultTip('chalk'), matte: 0.5 });
    expect(b.tip?.dry).toBeUndefined();
    expect(b.tip?.matte).toBeUndefined();
  });
});

describe('the stick picture', () => {
  it('is drawn on the smoothest paper', () => {
    expect(STICK_PICTURE_PAPER).toBe(PAPERS[0].id);
  });
  it('is the stick at its own width: a pencil is thinner than a vine charcoal', () => {
    const size = (id: string) => stickPictureBrush(MEDIA.find((m) => m.id === id)!.id).size;
    expect(size('sketch-pencil')).toBeLessThan(size('chalk'));
    expect(size('chalk')).toBeLessThan(size('vine-charcoal'));
  });
  it('names the stick in the tip, for every stick', () => {
    for (const m of MEDIA) expect(stickPictureBrush(m.id).tip?.dry).toBe(m.id);
  });
});

describe('the paper swatch', () => {
  it('catches ink only on the higher bumps, more on the highest', () => {
    expect(catchOf(0.2)).toBe(0);
    expect(catchOf(0.7)).toBeGreaterThan(0);
    expect(catchOf(0.95)).toBe(1);
  });
});
