// The pixel brush's parts and its Tip and Stick pickers (card pixel-brush-parity, piece 4), as pure functions.
import { describe, expect, it } from 'vitest';
import { DEFAULT_DAB, cleanDab } from '../../src/dab/maths';
import type { PixelSpec } from '../../src/dab/spec';
import { DEFAULT_GRAIN } from '../../src/dab/texture';
import { MEDIA } from '../../src/dry/maths';
import { pixelPartsOf, withPixelPaperOf, withPixelStickOf, withPixelTipOf } from '../../src/brushes/pixelParts';
import { parsePixelStickId, parsePixelTipId, pixelActiveId, pixelHint, pixelNameOf, pixelStickId, pixelStickRows, pixelTipId, pixelTipRows } from '../../src/brushes/pixelTipList';
import { stampPicture } from '../../src/brushes/pixelStarters';

const dab = (o: Partial<typeof DEFAULT_DAB> = {}): PixelSpec => ({ kind: 'dab', dab: cleanDab({ ...DEFAULT_DAB, ...o }) });
const dry = (medium: (typeof MEDIA)[number]['id'], size = 20): PixelSpec => ({ kind: 'dry', medium, size, hardness: 0.3, press: 0.7 });
const picture = stampPicture('star');

describe('pixelPartsOf', () => {
  it('says nothing for a brush that was never saved, or one of another kind', () => {
    expect(pixelPartsOf(undefined, dab()).changed).toBe(false);
    expect(pixelPartsOf(dab(), null).changed).toBe(false);
    expect(pixelPartsOf(dab(), dry('chalk')).changed).toBe(false);
  });
  it('marks the tip when it is another shape or another picture, and nothing else', () => {
    expect(pixelPartsOf(dab(), dab({ tip: 'square' }))).toEqual({ changed: true, tip: true, stick: false, other: false, paper: false });
    expect(pixelPartsOf(dab({ tip: 'picture', picture }), dab({ tip: 'picture', picture: stampPicture('leaf') })).tip).toBe(true);
    expect(pixelPartsOf(dab({ tip: 'picture', picture }), dab({ tip: 'picture', picture })).changed).toBe(false);
  });
  it('marks the rest when a slider moved, and leaves the tip as it came', () => {
    expect(pixelPartsOf(dab(), dab({ size: 40 }))).toMatchObject({ changed: true, tip: false, other: true });
  });
  it('marks the paper only for a brush that has a grain, and says which part', () => {
    const was = dab({ grain: { ...DEFAULT_GRAIN, paper: 'rough' } });
    expect(pixelPartsOf(was, dab({ grain: { ...DEFAULT_GRAIN, paper: 'fine' } }))).toMatchObject({ changed: true, paper: true, tip: false, other: false });
    expect(pixelPartsOf(dab(), dab()).paper).toBe(false);
  });
  it('marks the stick of Chalk and charcoal, and the rest of it', () => {
    expect(pixelPartsOf(dry('chalk'), dry('crayon'))).toMatchObject({ changed: true, stick: true });
    expect(pixelPartsOf(dry('chalk'), dry('chalk', 40))).toMatchObject({ changed: true, stick: false, other: true });
    expect(pixelPartsOf(dry('chalk'), dry('chalk')).changed).toBe(false);
  });
});

describe('putting a part back', () => {
  it('puts the tip back and keeps the size', () => {
    const back = withPixelTipOf(dab({ tip: 'square', size: 33 }), dab());
    expect(back.kind === 'dab' && back.dab.tip).toBe('round');
    expect(back.kind === 'dab' && back.dab.size).toBe(33);
  });
  it('puts the stick back and keeps the size', () => {
    const back = withPixelStickOf(dry('crayon', 50), dry('chalk'));
    expect(back).toMatchObject({ medium: 'chalk', size: 50 });
  });
  it('puts the brush\'s own paper back, or follows the sheet again when it came without one', () => {
    const was = dab({ grain: { ...DEFAULT_GRAIN, paper: 'rough' } });
    const live = dab({ grain: { ...DEFAULT_GRAIN, paper: 'fine' }, size: 12 });
    const a = withPixelPaperOf(live, was);
    expect(a.kind === 'dab' && a.dab.grain?.paper).toBe('rough');
    expect(a.kind === 'dab' && a.dab.size).toBe(12);
    const b = withPixelPaperOf(live, dab({ grain: { ...DEFAULT_GRAIN } }));
    expect(b.kind === 'dab' && b.dab.grain?.paper).toBeUndefined();
  });
  it('leaves a brush of another kind alone', () => {
    const d = dry('chalk');
    expect(withPixelTipOf(d, dab())).toBe(d);
    expect(withPixelStickOf(dab(), d)).toEqual(dab());
  });
});

describe('the pixel Tip and Stick pickers', () => {
  const live = { dab: cleanDab({ ...DEFAULT_DAB, tip: 'square' }), medium: 'chalk' as const };
  it('list Round, Square and Picture, each a pixel row with its own stroke', () => {
    const rows = pixelTipRows(live);
    expect(rows.map((r) => r.name)).toEqual(['Round', 'Square', 'Picture']);
    for (const r of rows) {
      expect(r.tool).toBe('pixel');
      expect(r.pixel?.kind).toBe('dab');
      expect(parsePixelTipId(r.id)).not.toBeNull();
    }
    expect(rows[2].pixel?.kind === 'dab' && rows[2].pixel.dab.tip).toBe('picture');
  });
  it('list the same nine sticks the vector Brush has, in groups', () => {
    const rows = pixelStickRows();
    expect(rows).toHaveLength(MEDIA.length);
    expect(new Set(rows.map((r) => r.group))).toEqual(new Set(['Charcoal', 'Chalk and pastel', 'Drawing pencils']));
    for (const r of rows) expect(r.pixel).toMatchObject({ kind: 'dry', paper: 'smooth' });
  });
  it('know the row in use, its name and a line about it', () => {
    expect(pixelActiveId('tip', live)).toBe(pixelTipId('square'));
    expect(pixelActiveId('stick', live)).toBe(pixelStickId('chalk'));
    expect(pixelNameOf('tip', live)).toBe('Square');
    expect(pixelNameOf('stick', live)).toBe('Chalk');
    expect(pixelHint(pixelTipId('square'))).toMatch(/corners/);
    expect(pixelHint(pixelStickId('crayon')).length).toBeGreaterThan(5);
  });
  it('read ids back, and turn away anything else', () => {
    expect(parsePixelTipId('ptip:picture')).toBe('picture');
    expect(parsePixelTipId('tip:plain')).toBeNull();
    expect(parsePixelStickId('pstick:oil-pastel')).toBe('oil-pastel');
    expect(parsePixelStickId('pstick:mud')).toBeNull();
    expect(parsePixelStickId('stick:chalk')).toBeNull();
  });
});
