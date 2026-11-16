// The saved pixel brush (what the pixel side of the library keeps): three kinds, read back safely, compared, resized.
import { describe, expect, it } from 'vitest';
import { DEFAULT_DAB } from '../../src/dab/maths';
import { cleanSpec, sameSpec, specSize, specTool, withSize, type PixelSpec } from '../../src/dab/spec';

const dab: PixelSpec = { kind: 'dab', dab: { ...DEFAULT_DAB, size: 9 } };
const soft: PixelSpec = { kind: 'soft', tool: 'airbrush', size: 28, hardness: 0, flow: 0.3 };
const dry: PixelSpec = { kind: 'dry', medium: 'chalk', paper: 'rough', size: 20, hardness: 0.3, press: 0.7 };

describe('reading a saved pixel brush', () => {
  it('keeps a good one of each kind exactly', () => {
    for (const s of [dab, soft, dry]) expect(cleanSpec(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('turns away what is not one, and a tool or medium that does not exist', () => {
    for (const bad of [null, 'dab', [], 3, {}, { kind: 'banana' }, { kind: 'soft', tool: 'paint' }, { kind: 'dry', medium: 'oil paint' }]) expect(cleanSpec(bad)).toBeNull();
  });

  it('holds numbers to their range and fills what is missing', () => {
    const s = cleanSpec({ kind: 'soft', tool: 'soft-brush', size: 9999, hardness: 4, flow: 'lots' });
    expect(s).toEqual({ kind: 'soft', tool: 'soft-brush', size: 120, hardness: 1, flow: 1 });
    const d = cleanSpec({ kind: 'dry', medium: 'crayon', paper: 'glossy', size: -2 });
    expect(d).toMatchObject({ kind: 'dry', medium: 'crayon', paper: 'medium', size: 1 });
    expect(cleanSpec({ kind: 'dab' })).toEqual({ kind: 'dab', dab: DEFAULT_DAB });
  });
});

describe('comparing', () => {
  it('knows the same brush from a changed one, and one kind from another', () => {
    expect(sameSpec(dab, { kind: 'dab', dab: { ...DEFAULT_DAB, size: 9 } })).toBe(true);
    expect(sameSpec(dab, { kind: 'dab', dab: { ...DEFAULT_DAB, size: 10 } })).toBe(false);
    expect(sameSpec(soft, { ...soft, flow: 0.31 })).toBe(false);
    expect(sameSpec(soft, { ...soft, flow: 0.3000000001 })).toBe(true);
    expect(sameSpec(dry, { ...dry, paper: 'fine' })).toBe(false);
    expect(sameSpec(soft, { ...soft, tool: 'soft-brush' })).toBe(false);
    expect(sameSpec(dab, soft)).toBe(false);
  });
});

describe('size and tool', () => {
  it('reads and changes the width whichever kind it is, inside that kind\'s own range', () => {
    expect([dab, soft, dry].map(specSize)).toEqual([9, 28, 20]);
    expect(specSize(withSize(dab, 200))).toBe(200);
    expect(specSize(withSize(dab, 9999))).toBe(300);
    expect(specSize(withSize(soft, 14.4))).toBe(14);
  });

  it('says which tool draws each kind', () => {
    expect([dab, soft, dry].map(specTool)).toEqual(['pixel-brush', 'airbrush', 'charcoal']);
  });
});
