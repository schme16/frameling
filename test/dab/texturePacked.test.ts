// A grain or dual picture is saved packed (the same "z1:" packing a soft tip's cells get) and still reads the old plain form.
import { deflateSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { cleanDab, DEFAULT_DAB } from '../../src/dab/maths';
import { cleanDual, cleanGrain, dualTile, grainTile } from '../../src/dab/texture';
import { cleanPicture, decodeBytes, dualTileFromPicture, encodeBytes, grainTileFromPicture, packBytes, pictureFromBytes, unpackBytes, type TexturePicture } from '../../src/dab/texturePicture';

/** A made up paper grain: soft bumps in steps plus the odd speck, the way a photographed paper is, `side` across. */
function grainBytes(side: number): Uint8Array {
  const out = new Uint8Array(side * side);
  let s = 12345;
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const bumps = 128 + 90 * Math.sin(x / 9) * Math.cos(y / 7);
      out[y * side + x] = Math.max(0, Math.min(255, Math.round(bumps / 16) * 16 + (((s >> 16) % 11) === 0 ? 1 : 0)));
    }
  return out;
}
const plain = (side: number, bytes: Uint8Array): TexturePicture => ({ side, data: encodeBytes(bytes) });

describe('a packed texture picture', () => {
  const bytes = grainBytes(256);
  const packed = pictureFromBytes(256, bytes);

  it('is saved packed and is a good deal smaller than plain base 64', () => {
    const before = JSON.stringify(plain(256, bytes)).length;
    const after = JSON.stringify(packed).length;
    expect(packed.data.startsWith('z1:')).toBe(true);
    expect(before).toBeGreaterThan(87_000);
    expect(after).toBeLessThan(before / 2);
  });

  it('round trips through JSON to the same bytes', () => {
    const back = cleanPicture(JSON.parse(JSON.stringify(packed)));
    expect(back).toEqual(packed);
    expect(decodeBytes(back!.data, 256 * 256)).toEqual(bytes);
  });

  it('still reads the old plain form, and holds it packed so it saves packed next time', () => {
    const old = plain(256, bytes);
    const read = cleanPicture(JSON.parse(JSON.stringify(old)))!;
    expect(read.data.startsWith('z1:')).toBe(true);
    expect(read).toEqual(packed);
    expect(decodeBytes(read.data, 256 * 256)).toEqual(bytes);
  });

  it('keeps the plain form when packing would not make it shorter', () => {
    let s = 7;
    const noise = Uint8Array.from({ length: 64 }, () => ((s = (s * 1103515245 + 12345) & 0x7fffffff), (s >> 16) & 255));
    const p = pictureFromBytes(8, noise);
    expect(p.data.startsWith('z1:')).toBe(false);
    expect(cleanPicture(p)).toEqual(p);
  });

  it('refuses a packed string that is the wrong length, not valid or made up', () => {
    const good = packed.data;
    const bad = (data: string, side = 256): TexturePicture | null => cleanPicture({ side, data });
    expect(bad(good, 128)).toBeNull();
    expect(bad(packBytes(new Uint8Array(100)))).toBeNull();
    expect(bad(packBytes(new Uint8Array(256 * 256 + 1)))).toBeNull();
    expect(bad('z1:')).toBeNull();
    expect(bad('z1:!!!!')).toBeNull();
    expect(bad(good.slice(0, 40))).toBeNull();
    expect(bad('z1:' + 'A'.repeat(good.length))).toBeNull();
    expect(bad('z2:' + good.slice(3))).toBeNull();
    // A squeezed bomb: far more than it claims, and a string too long for its side.
    const bomb = 'z1:' + encodeBytes(deflateSync(new Uint8Array(5_000_000)));
    expect(unpackBytes(bomb, 64)).toBeNull();
    expect(bad(bomb, 8)).toBeNull();
    expect(bad('z1:' + 'A'.repeat(10_000_000))).toBeNull();
  });

  it('samples the same pixels as the plain picture, for a grain and for a dual tip', () => {
    const old = plain(256, bytes);
    for (const invert of [false, true]) {
      for (const asIs of [false, true]) expect(grainTileFromPicture(packed, invert, asIs)).toEqual(grainTileFromPicture(old, invert, asIs));
      expect(dualTileFromPicture(packed, 0.4, invert, false, 1)).toEqual(dualTileFromPicture(old, 0.4, invert, false, 1));
    }
    const g = { depth: 0.8, scale: 1, moving: false };
    expect(grainTile({ ...g, picture: packed })).toEqual(grainTile({ ...g, picture: old }));
  });

  it('is read and saved packed inside a brush, as a grain and as a dual', () => {
    const old = plain(256, bytes);
    const grain = cleanGrain({ depth: 0.5, scale: 1, moving: false, picture: old })!;
    const dual = cleanDual({ tip: 'round', size: 3, density: 0.4, cut: false, picture: old })!;
    expect(grain.picture!.data.startsWith('z1:')).toBe(true);
    expect(dual.picture!.data.startsWith('z1:')).toBe(true);
    expect(dualTile(dual)).toEqual(dualTile({ ...dual, picture: old }));
    const dab = cleanDab({ ...DEFAULT_DAB, grain, dual });
    const text = JSON.stringify(dab);
    expect(text.length).toBeLessThan(JSON.stringify({ ...dab, grain: { ...grain, picture: old }, dual: { ...dual, picture: old } }).length / 2);
    expect(cleanDab(JSON.parse(text)).grain?.picture).toEqual(packed);
  });
});
