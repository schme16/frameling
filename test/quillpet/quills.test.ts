// His quills take your colours: which pencil becomes what, and the pixel swap that does it.
import { describe, expect, it } from 'vitest';
import { mapPencils, nothingToDo, parseHex, PENCILS, shadeOf, swapPixels, toHex } from '../../src/quillpet/quills';

const bytes = (...cols: string[]): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(cols.length * 4);
  cols.forEach((c, i) => {
    const [r, g, b] = parseHex(c)!;
    out.set([r, g, b, 255], i * 4);
  });
  return out;
};

describe('colours', () => {
  it('reads and writes hex, with or without the hash', () => {
    expect(parseHex('#ff6f91')).toEqual([255, 111, 145]);
    expect(parseHex('FF6F91')).toEqual([255, 111, 145]);
    expect(parseHex('nope')).toBeNull();
    expect(parseHex('#fff')).toBeNull();
    expect(toHex([255, 111, 145])).toBe('#ff6f91');
    expect(toHex([-20, 300, 0.4])).toBe('#00ff00');
  });

  it('shades a colour the way the art does, and leaves nonsense alone', () => {
    expect(shadeOf('#ffffff')).toBe('#c7c7c7');
    expect(shadeOf('#000000')).toBe('#000000');
    expect(shadeOf('rubbish')).toBe('rubbish');
  });
});

describe('which pencil becomes what', () => {
  it('leaves every pencil as drawn when you have given him nothing', () => {
    expect(mapPencils([])).toEqual(new Map());
    expect(nothingToDo(mapPencils([]))).toBe(true);
  });

  it('puts your newest colour on the last pencil, so a new one always shows', () => {
    const map = mapPencils(['#112233']);
    const last = PENCILS[PENCILS.length - 1];
    expect(map.get(last.bright)).toBe('#112233');
    expect(map.get(last.shade)).toBe(shadeOf('#112233'));
    expect(map.get(PENCILS[0].bright)).toBeUndefined();
  });

  it('fills every pencil once you have given him five, oldest first', () => {
    const mine = ['#111111', '#222222', '#333333', '#444444', '#555555'];
    const map = mapPencils(mine);
    PENCILS.forEach((p, i) => expect(map.get(p.bright)).toBe(mine[i]));
    expect(map.size).toBe(PENCILS.length * 2);
  });

  it('only keeps the last five when you have given him more', () => {
    const map = mapPencils(['#aaaaaa', '#111111', '#222222', '#333333', '#444444', '#555555']);
    expect([...map.values()]).not.toContain('#aaaaaa');
    expect(map.get(PENCILS[PENCILS.length - 1].bright)).toBe('#555555');
  });

  it('ignores anything that is not a colour', () => {
    expect(mapPencils(['not a colour', '#123456']).get(PENCILS[PENCILS.length - 1].bright)).toBe('#123456');
  });
});

describe('the pixel swap', () => {
  it('changes the pencil pixels and nothing else', () => {
    const data = bytes(PENCILS[4].bright, PENCILS[4].shade, '#ff9e6d', '#1d1b26');
    const hit = swapPixels(data, mapPencils(['#00ff00']));
    expect(hit).toBe(2);
    expect(toHex([data[0], data[1], data[2]])).toBe('#00ff00');
    expect(toHex([data[4], data[5], data[6]])).toBe(shadeOf('#00ff00'));
    // His face and his outline are left exactly as drawn.
    expect(toHex([data[8], data[9], data[10]])).toBe('#ff9e6d');
    expect(toHex([data[12], data[13], data[14]])).toBe('#1d1b26');
  });

  it('leaves see-through pixels alone', () => {
    const data = bytes(PENCILS[4].bright);
    data[3] = 0;
    expect(swapPixels(data, mapPencils(['#00ff00']))).toBe(0);
  });
});
