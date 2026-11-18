// One brush with two halves (piece 6): the optional `pair` on a saved brush, the starters that are one brush now, and
// old files that know nothing about `pair` opening as they are.
import { describe, expect, it } from 'vitest';
import { DEFAULT_BRUSH } from '../../src/core/doc';
import { DEFAULT_DAB } from '../../src/dab/maths';
import type { PixelSpec } from '../../src/dab/spec';
import {
  addShared,
  allPresets,
  brushesToText,
  LISTED_STARTERS,
  madeOn,
  parseBrushesText,
  PIXEL_STARTERS,
  pixelHalf,
  sanitizeList,
  sanitizePreset,
  STARTERS,
  updatePixelPreset,
  updatePreset,
  vectorHalf,
  type BrushPreset,
} from '../../src/brushes/model';
import { canonicalId, isMergedAway, MERGED_PAIRS } from '../../src/brushes/pairs';
import { toPixel, toVector } from '../../src/brushes/translate';

const spec = (size: number): PixelSpec => ({ kind: 'dab', dab: { ...DEFAULT_DAB, size } });
const wide = { ...DEFAULT_BRUSH, size: 40 };
const vecPreset = (extra: Partial<BrushPreset> = {}): BrushPreset => ({ id: 'v', name: 'V', tool: 'brush', brush: wide, ...extra });
const pixPreset = (extra: Partial<BrushPreset> = {}): BrushPreset => ({ id: 'p', name: 'P', tool: 'pixel', brush: DEFAULT_BRUSH, pixel: spec(9), ...extra });

describe('the starters that are one brush', () => {
  it('fold each pair into the vector brush, with the pixel brush as its pair, and show the pixel one only once', () => {
    expect(MERGED_PAIRS).toHaveLength(41);
    for (const [v, p] of MERGED_PAIRS) {
      const one = LISTED_STARTERS.find((s) => s.id === v)!;
      expect(one.pair, v).toEqual(PIXEL_STARTERS.find((s) => s.id === p)!.pixel);
      expect(one.brush, v).toBe(STARTERS.find((s) => s.id === v)!.brush);
      expect(LISTED_STARTERS.some((s) => s.id === p), p).toBe(false);
    }
    expect(LISTED_STARTERS).toHaveLength(STARTERS.length + PIXEL_STARTERS.length - MERGED_PAIRS.length);
  });
  it('leave the look-alikes as two brushes (Ink and Tapered ink, and so on)', () => {
    for (const id of ['starter:ink', 'starter:fineliner', 'starter:technical', 'starter:comic', 'starter:marker', 'starter:felt-tip', 'starter:bristle', 'starter:italic', 'starter:turning-nib', 'starter:chain-links']) {
      expect(LISTED_STARTERS.find((s) => s.id === id)!.pair, id).toBeUndefined();
    }
    for (const id of ['starter:px-tapered-ink', 'starter:px-smooth-pen', 'starter:px-round3', 'starter:px-inking-pen', 'starter:px-smooth-felt', 'starter:px-felt-marker', 'starter:px-bristles', 'starter:px-chisel', 'starter:px-turning-chisel', 'starter:px-diamonds']) {
      expect(LISTED_STARTERS.some((s) => s.id === id), id).toBe(true);
    }
  });
  it('keep every id once, and the old pixel ids point at the vector brush', () => {
    const ids = allPresets([]).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [v, p] of MERGED_PAIRS) {
      expect(canonicalId(p)).toBe(v);
      expect(isMergedAway(p)).toBe(true);
    }
    expect(canonicalId('starter:ink')).toBe('starter:ink');
    expect(canonicalId('b123')).toBe('b123');
  });
  it('have two made halves for a pair, one for the rest', () => {
    const leaves = LISTED_STARTERS.find((s) => s.id === 'starter:leaves')!;
    expect(madeOn(leaves, 'vector') && madeOn(leaves, 'pixel')).toBe(true);
    const gouache = LISTED_STARTERS.find((s) => s.id === 'starter:gouache')!;
    expect(madeOn(gouache, 'vector')).toBe(true);
    expect(madeOn(gouache, 'pixel')).toBe(false);
    const wet = LISTED_STARTERS.find((s) => s.id === 'starter:px-wet-smear')!;
    expect(madeOn(wet, 'pixel')).toBe(true);
    expect(madeOn(wet, 'vector')).toBe(false);
  });
});

describe('the two halves of a brush', () => {
  it('gives the half it was made with, exactly, and works the other out once', () => {
    const v = vecPreset();
    expect(vectorHalf(v)).toBe(v.brush);
    expect(pixelHalf(v)).toEqual(toPixel(wide));
    expect(pixelHalf(v)).toBe(pixelHalf(v));
    const p = pixPreset();
    expect(pixelHalf(p)).toBe(p.pixel);
    expect(vectorHalf(p)).toEqual(toVector(spec(9)));
    expect(vectorHalf(p)).toBe(vectorHalf(p));
  });
  it('gives the half it was made with as the pair, when it has one', () => {
    const v = vecPreset({ pair: spec(7) });
    expect(pixelHalf(v)).toBe(v.pair);
    const p = pixPreset({ pair: { ...DEFAULT_BRUSH, size: 11 } });
    expect(vectorHalf(p)).toBe(p.pair);
  });
  it('is not changed by asking for the other half, so going there and back loses nothing', () => {
    const v = vecPreset();
    const p = pixPreset();
    const copyV = structuredClone(v);
    const copyP = structuredClone(p);
    pixelHalf(v);
    vectorHalf(p);
    expect(v).toEqual(copyV);
    expect(p).toEqual(copyP);
  });
  it('makes the half you update a half of its own, and leaves the other as it was', () => {
    const p = pixPreset();
    const [a] = updatePreset([p], 'p', { ...DEFAULT_BRUSH, size: 21 });
    expect(a.pair).toMatchObject({ size: 21 });
    expect(a.pixel).toBe(p.pixel);
    const [b] = updatePixelPreset([vecPreset()], 'v', spec(5));
    expect(b.pair).toEqual(spec(5));
    expect(b.brush).toEqual(wide);
    // A made half is updated in place, and never the pair.
    const [c] = updatePreset([vecPreset({ pair: spec(7) })], 'v', { ...wide, size: 3 });
    expect(c.brush.size).toBe(3);
    expect(c.pair).toEqual(spec(7));
  });
});

describe('reading and writing a pair', () => {
  it('reads a pair of the right kind, and drops one that is rubbish or of the wrong kind', () => {
    expect(sanitizePreset({ name: 'A', tool: 'brush', brush: wide, pair: spec(7) }, 'a')?.pair).toEqual(spec(7));
    expect(sanitizePreset({ name: 'A', tool: 'pixel', pixel: spec(9), pair: { ...wide, size: 12 } }, 'a')?.pair).toMatchObject({ size: 12 });
    expect(sanitizePreset({ name: 'A', tool: 'brush', brush: wide, pair: { kind: 'nonsense' } }, 'a')?.pair).toBeUndefined();
    expect(sanitizePreset({ name: 'A', tool: 'pixel', pixel: spec(9), pair: 'x' }, 'a')?.pair).toBeUndefined();
    expect(sanitizePreset({ name: 'A', tool: 'brush', brush: wide, pair: null }, 'a')?.pair).toBeUndefined();
  });
  it('opens a brush saved before there was a pair, as it was', () => {
    const old = sanitizeList([{ id: 'x', name: 'Old', tool: 'brush', brush: wide }, { id: 'y', name: 'Older', brush: wide }, { id: 'z', name: 'Px', tool: 'pixel', pixel: spec(4) }]);
    expect(old.map((p) => p.pair)).toEqual([undefined, undefined, undefined]);
    expect(vectorHalf(old[0])).toEqual(wide);
    expect(pixelHalf(old[2])).toEqual(spec(4));
  });
  it('writes it into a shared file and reads it back, for either kind of brush', () => {
    const list = [vecPreset({ pair: spec(7), group: 'Mine' }), pixPreset({ pair: { ...DEFAULT_BRUSH, size: 11 } })];
    const text = brushesToText(list);
    const r = parseBrushesText(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { list: out } = addShared([], r.presets, (() => {
      let n = 0;
      return () => `n${++n}`;
    })());
    expect(out[0]).toMatchObject({ tool: 'brush', group: 'Mine', pair: spec(7) });
    expect(out[1]).toMatchObject({ tool: 'pixel', pair: { size: 11 } });
  });
  it('leaves the pair out of a file when there is none, and the file keeps its version', () => {
    const o = JSON.parse(brushesToText([vecPreset(), pixPreset()]));
    expect(o.version).toBe(1);
    expect('pair' in o.presets[0]).toBe(false);
    expect('pair' in o.presets[1]).toBe(false);
  });
  it('is rebuilt by translation when an older build rewrote the file and dropped the pair', () => {
    const withPair = vecPreset({ pair: spec(7) });
    const dropped = sanitizePreset({ name: 'V', tool: 'brush', brush: withPair.brush }, 'v')!;
    expect(dropped.pair).toBeUndefined();
    expect(pixelHalf(dropped)).toEqual(toPixel(wide));
  });
});
